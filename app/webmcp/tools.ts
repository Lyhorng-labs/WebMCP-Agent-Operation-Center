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
  setWebMCPStatus,
} from "../lib/ops/store";
import type { PlanAction } from "../lib/ops/types";

const REGISTERED_FLAG = "__aocWebMCPRegistered";

/** Ask the browser what is actually registered, rather than trusting our own bookkeeping. */
async function registeredNames(modelContext: WebMCPModelContext): Promise<string[]> {
  try {
    const tools = await modelContext.getTools();
    if (!Array.isArray(tools)) return [];
    return tools
      .map((t) => t?.name)
      .filter((n): n is string => typeof n === "string");
  } catch {
    return [];
  }
}

/**
 * Normalize the tool result shape in ONE place. MCP wants content blocks; some
 * polyfills accept a bare string. Verify against the hackathon starter -- if it
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
      "service with its current health. Start here to learn valid service ids.\n\n" +
      "REQUIRED WORKFLOW for this app: (1) investigate with the read tools, " +
      "(2) call record_finding with your conclusion and evidence, " +
      "(3) call propose_remediation with your plan, " +
      "(4) call the action tool named in that plan, " +
      "(5) call verify_recovery. Steps 2 and 3 are safe, change no system state, " +
      "and are how your work reaches the operator's screen. Writing your analysis " +
      "in chat instead does NOT reach them.",
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
      "Carry out a rollback the operator has ALREADY APPROVED.\n\n" +
      "DO NOT ask the operator for permission before calling this, and do not end " +
      "your turn to confirm. Permission was already granted when they clicked APPROVE " +
      "on the card -- that click is what propose_remediation returned to you. Asking " +
      "again leaves the incident unresolved while the outage continues.\n\n" +
      "The planId is your proof of approval. This call verifies that the plan is " +
      "approved, that it has not already been executed, and that your arguments match " +
      "exactly what the operator approved; if any of that fails, it refuses and tells " +
      "you why. So calling it is always safe: an unapproved call cannot do damage.\n\n" +
      "After it succeeds, call verify_recovery.",
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
    note: (a) => `Rollback ${a.serviceId} → ${a.toVersion}`,
    run: async ({ planId, serviceId, toVersion }) => {
      const plan = getPlan(planId);
      if (!plan) {
        return { error: `No plan "${planId}". Call propose_remediation first.` };
      }
      if (plan.status === "used") {
        return { error: "Already executed. One approval buys one execution." };
      }
      
      const decision = await awaitDecision(planId, 45_000);

      if (decision === "timeout") {
        return {
          status: "awaiting_approval",
          planId,
          message:
            "Still waiting for human approval. Ask the operator to click APPROVE in the " +
            "Remediation Plan panel, then call rollback_deployment again with the same " +
            "planId and identical params.",
        };
      }

      // Re-read: patchPlan replaced the object, so the `plan` captured above
      // is a stale snapshot without the rejection reason.
      const decided = getPlan(planId);
      if (decision === "rejected") {
        return {
          error: "Plan rejected by the operator.",
          reason: decided?.rejectionReason ?? null,
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
      "it, so the human can audit your reasoning.\n\n" +
      "SAFE: writes only to the investigation panel. Changes no production state and " +
      "needs no permission. Call it as soon as you have a supported conclusion, " +
      "including conclusions that RULE OUT a suspect. Do not summarise findings in " +
      "chat instead; the operator reads this panel, not your message.",
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
      "Put your remediation plan on the operator's screen as an approval card, and " +
      "WAIT here for their decision.\n\n" +
      "SAFE: this executes nothing and changes no production state. It IS how you ask " +
      "for permission, so it needs no permission of its own. Call it as soon as you " +
      "have a plan.\n\n" +
      "THIS CALL BLOCKS until the operator clicks APPROVE or REJECT in the UI. That is " +
      "expected and correct: blocking is how their decision reaches you. Do NOT end " +
      "your turn to wait for a chat reply -- the operator answers by clicking, not by " +
      "typing.\n\n" +
      "When it returns approved, immediately call the action tool named in `action` " +
      "with the returned planId and the same params. Follow the `next` field it gives " +
      "you.",
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
    run: async (input) => {
      const plan = createPlan(input);

      // Block HERE rather than in the action tool. The agent reliably calls this
      // one -- it is the only way to ask for permission -- whereas it tends to
      // avoid calling a tool it believes it lacks permission for, which left the
      // approval card with nothing waiting on it.
      const decision = await awaitDecision(plan.id, 45_000);

      const actionCall =
        `${plan.action} with planId "${plan.id}" and exactly these params: ` +
        `${JSON.stringify(plan.params)}`;

      if (decision === "approved") {
        return {
          planId: plan.id,
          status: "approved",
          next:
            `The operator has APPROVED this plan by clicking the card. You already ` +
            `have permission -- do NOT ask them again and do NOT end your turn. ` +
            `Call ${actionCall} now; it will return immediately. Then call verify_recovery.`,
        };
      }

      if (decision === "rejected") {
        return {
          planId: plan.id,
          status: "rejected",
          reason: getPlan(plan.id)?.rejectionReason ?? null,
          next: "Do not execute anything. Report the rejection to the operator and stop.",
        };
      }

      return {
        planId: plan.id,
        status: "awaiting_approval",
        next:
          `The operator has not decided yet. Do NOT end your turn. Call ${actionCall} ` +
          `now -- that call will keep waiting for their decision.`,
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

export function registerWebMCPTools(): () => void {
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__ops = {
      list: () => TOOL_NAMES,
      /** Calls our local implementation. */
      call: async (name: string, args: Record<string, unknown> = {}) => {
        const tool = TOOLS.find((t) => t.name === name);
        if (!tool) throw new Error(`No tool "${name}". Try: ${TOOL_NAMES.join(", ")}`);
        return tool.execute(args);
      },
      /** Calls through the BROWSER's registry -- the path a real agent takes. */
      callViaBrowser: async (name: string, args: Record<string, unknown> = {}) => {
        const modelContext = document.modelContext;
        if (!modelContext) throw new Error("document.modelContext unavailable");
        // executeTool wants the browser's RegisteredTool handle, not a name.
        const registered = await modelContext.getTools();
        const handle = registered.find((t) => t?.name === name);
        if (!handle) {
          throw new Error(
            `"${name}" is not registered. Registered: ${registered.map((t) => t?.name).join(", ")}`,
          );
        }
        // executeTool takes and returns JSON strings, not objects.
        const raw = await modelContext.executeTool(handle, JSON.stringify(args));
        try {
          return typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
          return raw;
        }
      },
      /** Inspect a RegisteredTool handle, for when the API shape is unclear. */
      inspect: async (name: string) => {
        const modelContext = document.modelContext;
        if (!modelContext) throw new Error("document.modelContext unavailable");
        const handle = (await modelContext.getTools()).find((t) => t?.name === name);
        return {
          handle,
          own: handle ? Object.getOwnPropertyNames(handle) : [],
          proto: handle
            ? Object.getOwnPropertyNames(Object.getPrototypeOf(handle))
            : [],
        };
      },
      registered: async () =>
        document.modelContext ? registeredNames(document.modelContext) : [],
    };
  }

  if (typeof document === "undefined" || !document.modelContext) {
    setWebMCPStatus(false, []);
    return () => {};
  }

  const modelContext = document.modelContext;
  const globals = window as unknown as Record<string, unknown>;

  const sync = () => {
    void registeredNames(modelContext).then((names) => setWebMCPStatus(true, names));
  };

  // Already registered by an earlier mount of this module. Re-read the browser's
  // registry so the header reflects reality rather than assuming.
  if (globals[REGISTERED_FLAG]) {
    sync();
    return () => {};
  }
  globals[REGISTERED_FLAG] = true;

  void (async () => {
    for (const tool of TOOLS) {
      try {
        await modelContext.registerTool(tool);
      } catch (error) {
        console.warn(`WebMCP: failed to register "${tool.name}"`, error);
      }
    }
    sync();
  })();

  return () => {};
}
