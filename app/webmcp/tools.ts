import {
  applyRollback,
  awaitDecision,
  delta,
  finishToolCall,
  getPlan,
  getService,
  getSnapshot,
  planMismatch,
  serviceIds,
  startToolCall,
  ui,
  addFinding,
  createPlan,
  evaluateRecovery,
  resolveIncident,
} from "../lib/ops/store";
import type { PlanAction } from "../lib/ops/types";
type Unregister = () => void | Promise<void>;

/**
 * Unregister callbacks for tools this module has live, keyed by tool name.
 * Module-level so a StrictMode remount (or a Fast Refresh of a module that
 * imports this one) can tear down the previous registration instead of
 * colliding with it.
 */
const activeTools = new Map<string, Unregister>();

/**
 * One promise chain per tool name. `registerTool` is async, so without this
 * StrictMode's mount -> cleanup -> mount can start the second registration
 * before the first has resolved and been released.
 */
const queues = new Map<string, Promise<unknown>>();

function queue<T>(name: string, step: () => Promise<T>): Promise<T> {
  const next = (queues.get(name) ?? Promise.resolve()).then(step, step);
  // Keep the chain alive after a failed step; callers handle their own errors.
  queues.set(
    name,
    next.catch(() => {}),
  );
  return next;
}

/** Normalize the several shapes `registerTool` can return into one callback. */
function toUnregister(
  modelContext: WebMCPModelContext,
  name: string,
  result: WebMCPRegisterResult,
): Unregister {
  if (typeof result === "function") {
    return result;
  }
  if (result && typeof result.unregister === "function") {
    return () => result.unregister();
  }
  return () => modelContext.unregisterTool?.(name);
}

async function releaseTool(modelContext: WebMCPModelContext, name: string) {
  const unregister = activeTools.get(name);
  activeTools.delete(name);
  if (unregister) {
    await unregister();
    return;
  }
  // No handle of our own — this module instance was replaced by Fast Refresh
  // while its tool stayed registered. Fall back to removal by name.
  await modelContext.unregisterTool?.(name);
}

async function claimTool(
  modelContext: WebMCPModelContext,
  descriptor: WebMCPToolDescriptor,
) {
  await releaseTool(modelContext, descriptor.name);
  const result = await modelContext.registerTool(descriptor);
  activeTools.set(
    descriptor.name,
    toUnregister(modelContext, descriptor.name, result),
  );
}

/**
 * Normalize the tool result shape in ONE place. MCP wants content blocks; some
 * polyfills accept a bare string. Verify against the hackathon starter — if it
 * differs, this function is the only edit.
 */
function text(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

interface ToolSpec<A> {
  name: string;
  title: string;
  description: string;
  inputSchema: WebMCPJSONSchema;
  /** One-line summary for the Agent Activity feed. */
  note?: (args: A) => string;
  run: (args: A) => unknown | Promise<unknown>;
}

/**
 * Wraps a tool so every call is logged to the activity feed and no error can
 * escape. Doing this per-tool by hand across 9 tools guarantees an inconsistent
 * panel; doing it here means it is impossible to forget.
 */
function defineTool<A extends Record<string, unknown>>(
  spec: ToolSpec<A>,
): WebMCPToolDescriptor {
  return {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    inputSchema: spec.inputSchema,
    execute: async (rawArgs) => {
      const args = (rawArgs ?? {}) as A;
      const callId = startToolCall(spec.name, args);
      try {
        const result = await spec.run(args);
        finishToolCall(callId, "ok", spec.note?.(args));
        return text(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        finishToolCall(callId, "error", message);
        // Return the error instead of throwing: a thrown tool dead-ends the agent.
        return text({ error: message });
      }
    },
  };
}

const TOOLS: WebMCPToolDescriptor[] = [
  defineTool<Record<string, never>>({
    name: "get_system_status",
    title: "Get System Status",
    description:
      "Orientation call. Returns the active incident and every production " +
      "service with its current health. Start here to learn valid service ids.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    note: () => "Checked overall system status",
    run: () => {
      const { incident, services } = getSnapshot();
      return {
        incident,
        services: services.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          current: s.current,
        })),
      };
    },
  }),

  defineTool<{ serviceId: string }>({
    name: "get_service_health",
    title: "Get Service Health",
    description:
      "Return current metrics for one service compared against its 7-day " +
      "baseline. Use to quantify how abnormal a service is. Does not diagnose " +
      "a cause.",
    inputSchema: {
      type: "object",
      properties: {
        serviceId: {
          type: "string",
          description:
            "e.g. 'payment-service'. Get valid ids from get_system_status.",
        },
      },
      required: ["serviceId"],
      additionalProperties: false,
    },
    note: (a) => `Checked ${a.serviceId} health`,
    run: ({ serviceId }) => {
      const service = getService(serviceId);
      if (!service) {
        return { error: `Unknown serviceId "${serviceId}"`, knownIds: serviceIds() };
      }
      ui.focusService(serviceId);
      return {
        serviceId,
        status: service.status,
        deltaVsBaseline: delta(serviceId),
      };
    },
  }),

  defineTool<{ planId: string; serviceId: string; toVersion: string }>({
    name: "rollback_deployment",
    title: "Rollback Deployment",
    description:
      "Roll a service back to a previous version. DESTRUCTIVE: requires an " +
      "approved plan from propose_remediation. Blocks until a human approves " +
      "or rejects.",
    inputSchema: {
      type: "object",
      properties: {
        planId: {
          type: "string",
          description: "planId returned by propose_remediation.",
        },
        serviceId: { type: "string" },
        toVersion: {
          type: "string",
          description: "previousVersion from get_recent_deployments.",
        },
      },
      required: ["planId", "serviceId", "toVersion"],
      additionalProperties: false,
    },
    note: (a) => `Rolled back ${a.serviceId} to ${a.toVersion}`,
    run: async ({ planId, serviceId, toVersion }) => {
      const plan = getPlan(planId);
      if (!plan) {
        return { error: `No plan "${planId}". Call propose_remediation first.` };
      }
      if (plan.status === "used") {
        return { error: "Already executed. One approval buys one execution." };
      }

      const decision = await awaitDecision(planId); // <- parks on the human
      if (decision !== "approved") {
        return {
          error: `Not approved (${decision}).`,
          reason: plan.rejectionReason ?? null,
        };
      }

      const mismatch = planMismatch(plan, "rollback_deployment", {
        serviceId,
        toVersion,
      });
      if (mismatch) {
        return { error: "Arguments differ from the approved plan.", mismatch };
      }

      return applyRollback(serviceId, toVersion, planId);
    },
  }),
  defineTool<{serviceId?: string; sinceMinutes?:number}>({
    name: "get_recent_deployments",
    title: "Get Recent Deployments",
    description:
      "List deployments, most recent first, with the version each one replaced. " +
      "Compare deployedMinutesAgo against the incident's startedMinutesAgo to " +
      "test whether a deploy could have caused it.",
    inputSchema:{
      type: "object",
      properties:{
        serviceId: { type: "string", description: "Omit to see deployments across all services."},
        sinceMinutes: {type: "number", description: "Lookback window. Default 120."},
      },
      additionalProperties: false,
    },
    note: (a)=> `Reviewed deployments${a.serviceId ? ` for ${a.serviceId}` : "(all services"}`,
    run: ({serviceId, sinceMinutes= 120})=>{
      if (serviceId && !getService(serviceId)){
        return { error: `Unknown serviceId "${serviceId}"`, knownIds: serviceIds()};
      }
      if (serviceId) ui.focusService(serviceId);
      const deployments= getSnapshot().deployments.filter((d)=>
      (!serviceId || d.serviceId === serviceId) && d.deployedMinutesAgo <= sinceMinutes,
      ).sort((a, b)=> a.deployedMinutesAgo - b.deployedMinutesAgo);
      return { sinceMinutes, count: deployments.length, deployments};
    },
  }),
  defineTool<{ serviceId: string }>({
    name: "get_service_dependencies",
    title: "Get Service Dependencies",
    description:
      "Return what a service calls (dependsOn) and what calls it (dependedOnBy). " +
      "Use to establish blast radius: a failure can only propagate from a service " +
      "to the services that depend on it.",
    inputSchema: {
      type: "object",
      properties: { serviceId: { type: "string" } },
      required: ["serviceId"],
      additionalProperties: false,
    },
    note: (a) => `Mapped dependencies for ${a.serviceId}`,
    run: ({ serviceId }) => {
      if (!getService(serviceId)) {
        return { error: `Unknown serviceId "${serviceId}"`, knownIds: serviceIds() };
      }
      ui.focusService(serviceId);
      const { dependencies } = getSnapshot();
      return {
        serviceId,
        dependsOn: dependencies.filter((d) => d.from === serviceId),
        dependedOnBy: dependencies.filter((d) => d.to === serviceId),
      };
    },
  }),
  defineTool<{
    serviceId?: string;
    level?: "INFO" | "WARN" | "ERROR";
    contains?: string;
    sinceMinutes?: number;
    limit?: number;
  }>({
    name: "query_logs",
    title: "Query Logs",
    description:
      "Search production logs with optional filters. Narrow with `contains` to " +
      "test a specific hypothesis rather than reading everything.",
    inputSchema: {
      type: "object",
      properties: {
        serviceId: { type: "string" },
        level: { type: "string", enum: ["INFO", "WARN", "ERROR"] },
        contains: { type: "string", description: "Case-insensitive substring match on the message." },
        sinceMinutes: { type: "number", description: "Default 30." },
        limit: { type: "number", description: "Default 50." },
      },
      additionalProperties: false,
    },
    note: (a) =>
      `Queried logs${a.serviceId ? ` for ${a.serviceId}` : ""}${a.contains ? ` matching "${a.contains}"` : ""}`,
    run: ({ serviceId, level, contains, sinceMinutes = 30, limit = 50 }) => {
      ui.filterLogs({ serviceId, level, contains });
      const needle = contains?.toLowerCase();
      const matched = getSnapshot()
        .logs.filter(
          (l) =>
            (!serviceId || l.serviceId === serviceId) &&
            (!level || l.level === level) &&
            (!needle || l.message.toLowerCase().includes(needle)) &&
            l.atMinutesAgo <= sinceMinutes,
        )
        .sort((a, b) => a.atMinutesAgo - b.atMinutesAgo);
      return {
        filter: { serviceId, level, contains, sinceMinutes },
        total: matched.length,
        entries: matched.slice(0, limit),
      };
    },
  }),
  defineTool<{ summary: string; evidence: string[]; confidence: "low" | "medium" | "high" }>({
    name: "record_finding",
    title: "Record Finding",
    description:
      "Record a conclusion you have reached, with the concrete evidence supporting " +
      "it, so the human can audit your reasoning. Call this before proposing any fix.",
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One sentence stating what you concluded." },
        evidence: {
          type: "array",
          items: { type: "string" },
          description:
            "Specific observations from tool results: metric values, log messages, deployment ids. Not restatements of the conclusion.",
        },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["summary", "evidence", "confidence"],
      additionalProperties: false,
    },
    note: (a) => `Recorded finding: ${a.summary}`,
    run: ({ summary, evidence, confidence }) => {
      if (!Array.isArray(evidence) || evidence.length === 0) {
        return {
          error:
            "evidence must be a non-empty array of concrete observations (metric values, log lines, deployment ids).",
        };
      }
      return { findingId: addFinding({ summary, evidence, confidence }).id };
    },
  }),
  defineTool<{
    rootCause: string;
    rationale: string;
    action: PlanAction;
    params: Record<string, unknown>;
    risk: "low" | "medium" | "high";
    expectedRecovery: "low" | "medium" | "high";
  }>({
    name: "propose_remediation",
    title: "Propose Remediation",
    description:
      "Submit a remediation plan for human approval. This does NOT execute " +
      "anything — it renders an approval card. Afterwards call the action tool " +
      "with the returned planId; it will block until a human decides.",
    inputSchema: {
      type: "object",
      properties: {
        rootCause: { type: "string" },
        rationale: { type: "string", description: "Why this action fixes that root cause." },
        action: {
          type: "string",
          enum: ["rollback_deployment", "restart_service", "set_feature_flag"],
        },
        params: {
          type: "object",
          description:
            "Exact arguments you will pass to the action tool, e.g. { serviceId, toVersion }. These are locked at approval.",
        },
        risk: { type: "string", enum: ["low", "medium", "high"] },
        expectedRecovery: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["rootCause", "rationale", "action", "params", "risk", "expectedRecovery"],
      additionalProperties: false,
    },
    note: (a) => `Proposed ${a.action} — awaiting approval`,
    run: (input) => {
      const plan = createPlan(input);
      return {
        planId: plan.id,
        status: plan.status,
        next: `Call ${plan.action} with planId "${plan.id}" and exactly these params: ${JSON.stringify(plan.params)}`,
      };
    },
  }),
  defineTool<{ summary?: string }>({
    name: "verify_recovery",
    title: "Verify Recovery",
    description:
      "Re-read metrics for every service in the incident and report whether they " +
      "returned to baseline. Resolves the incident if they have. Always call this " +
      "after an action — never assume a fix worked.",
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One-line postmortem, used if recovery is confirmed." },
      },
      additionalProperties: false,
    },
    note: () => "Verified recovery",
    run: ({ summary }) => {
      const { recovered, affected } = evaluateRecovery();
      if (recovered) resolveIncident(summary ?? "Recovered after remediation.");
      return {
        recovered,
        incidentStatus: getSnapshot().incident.status,
        services: affected.map((s) => ({
          id: s.id,
          status: s.status,
          deltaVsBaseline: delta(s.id),
        })),
      };
    },
  }),
];
export const TOOL_NAMES= TOOLS.map((t)=> t.name);
/**
 * Registers this page's WebMCP tools and returns a cleanup function.
 */
export function registerWebMCPTools(): () => void {
  if (typeof document === "undefined" || !document.modelContext) {
    return () => {};
  }

  const modelContext = document.modelContext;

  for (const tool of TOOLS) {
    queue(tool.name, () => claimTool(modelContext, tool)).catch(
      (error: unknown) => {
        console.warn(`WebMCP: failed to register "${tool.name}"`, error);
      },
    );
  }

  let released = false;

  return () => {
    if (released) {
      return;
    }
    released = true;

    for (const tool of TOOLS) {
      queue(tool.name, () => releaseTool(modelContext, tool.name)).catch(
        (error: unknown) => {
          console.warn(`WebMCP: failed to unregister "${tool.name}"`, error);
        },
      );
    }
  };
}
