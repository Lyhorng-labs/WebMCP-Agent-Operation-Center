import { seedState } from "./seed";
import type { Finding, LogFilter, Metrics, Service, SystemState } from "./types";
import type { Plan, PlanAction, ToolCall } from "./types";

let   state: SystemState = seedState();
const listeners = new Set<() => void>();
export function setWebMCPStatus(available: boolean, registered: string[]): void {
  commit({ webmcp: { available, registered } });
}
/** Subscribe/getSnapshot pair consumed by useSyncExternalStore. */
export function subscribe(listener: ()=> void): ()=> void {
    listeners.add(listener);
    return ()=> { listeners.delete(listener); };
}
/**
 * Must return a referentially STABLE value between commits — React re-runs
 * this on every render and infinite-loops if it sees a new object each time.
 */
export function getSnapshot(): SystemState{
    return state;
}
function commit(patch: Partial<SystemState>): void{
    state= { ...state, ...patch };
    for (const listener of listeners) listener();
}
export function resetDemo(): void{
    // Registration lives in the browser and survives a data reset -- carry the
    // status forward, or the header wrongly reports WebMCP as unavailable.
    const webmcp = state.webmcp;
    state = { ...seedState(), webmcp };
    for (const listener of listeners) listener();
}

export function getService(id: string): Service | null {
    return state.services.find((s)=> s.id === id) ?? null;
}
export function serviceIds(): string[]{
    return state.services.map((s)=> s.id);
}
/** Ratios, not verdicts. The agent decides what "8.1x" means. */
export function delta(id: string){
    const service= getService(id);
    if (!service) return null;
    const ratio= (k: keyof Metrics)=>
        service.baseline[k] === 0 ? null : +(service.current[k] / service.baseline[k]).toFixed(2);
    return {
        successRate: {current: service.current.successRate, baseline: service.baseline.successRate,
            pointChange: +(service.current.successRate - service.baseline.successRate).toFixed(4)
        },
        errorRate:{current: service.current.errorRate, baseline: service.baseline.errorRate,
            ratio: ratio("errorRate"),
        },
        p95Ms: {current: service.current.p95Ms, baseline: service.baseline.p95Ms, ratio: ratio("p95Ms")

        },
    };
}
export function addFinding(input: Omit<Finding, "id" | "recordedAt">): Finding {
  const finding: Finding = {
    ...input,
    id: `finding-${state.findings.length + 1}`,
    recordedAt: Date.now(),
  };
  commit({ findings: [...state.findings, finding] });
  return finding;
}
export const ui={
    focusService(id: string | null) { commit ({ focusedServiceId: id});},
    filterLogs(filter: LogFilter | null){ commit({logFilter: filter});},
};

/** Activity feed (panel 6) */
export function startToolCall(tool: string, args: Record<string, unknown>): string{
    const id= `call-${state.toolCalls.length + 1}`;
    const call: ToolCall={ id, tool, args, at:Date.now(), status:"pending"};
    commit({toolCalls: [...state.toolCalls, call]});
    return id;
};
export function finishToolCall(id: string, status:"ok" | "error", note?: string): void{
    commit({
        toolCalls: state.toolCalls.map((c)=> (c.id === id ? { ...c, status, note}: c)),
    });
};
/** plans */
export function createPlan(input: Omit<Plan, "id" | "status">): Plan{
    const plan: Plan= {
        ...input, id: `plan-${state.plans.length + 1}`, status: "awaiting_approval"
    };
    commit({plans: [...state.plans, plan]});
    return plan
}
export function getPlan(id: string):Plan | null{
    return state.plans.find((p)=> p.id === id) ?? null;
}
export function patchPlan(id:string, patch: Partial<Plan>): void{
    commit({plans: state.plans.map((p)=> (p.id === id ? {...p, ...patch} : p))});
}
/**Every key the human approved must mathc exactly. Return a reason, or null */
export function planMismatch(plan: Plan, action: PlanAction, params: Record<string, unknown>): string | null{
    if (plan.action !== action){
        return `approved action "${plan.action}" but attemptd "${action}"`;
    }
    for (const [key, approved] of Object.entries(plan.params)){
        if (params[key] !== approved){
            return `param "${key}": approved ${JSON.stringify(approved)}, attempted ${JSON.stringify(params[key])}`;
        }   
    }
    return null;
}
/** the approval bridge */
type Decision= "approved" | "rejected" | "timeout";

/** planId -> the resolve() of a tool call currently parked mid-execute(). */
const waiters= new Map<string, (d: Decision)=>void>();
/** Called from a React onClick. */
export function approvePlan(id: string):void{
    patchPlan(id, {status: "approved"});
    waiters.get(id)?.("approved");
    waiters.delete(id);
}
export function rejectPlan(id: string, reason: string):void{
    patchPlan(id, { status: "rejected", rejectionReason: reason });
    waiters.get(id)?.("rejected");
    waiters.delete(id);
}
/** Suspends the caller until a human decides.*/
export function awaitDecision(planId: string, timeoutMs= 120_000): Promise<Decision>{
    const plan= getPlan(planId);
    if (!plan) return Promise.resolve("rejected");
    if (plan.status === "approved") return Promise.resolve("approved");
    if (plan.status === "rejected") return Promise.resolve("rejected");
    return new Promise((resolve)=>{
        const timer= setTimeout(()=>{
            waiters.delete(planId);
            resolve("timeout");
        }, timeoutMs);
        waiters.set(planId, (decision)=> {
            clearTimeout(timer);
            resolve(decision);
        });
    });
}
/** the actual production mutation */
export function applyRollback(serviceId: string, toVersion: string, planId: string){
    const service= getService(serviceId);
    if (!service) throw new Error(`Unknown serviceId"${serviceId}"`);
    const active = state.deployments.find((d)=> d.serviceId === serviceId && d.status === "active");
    if (!active) throw new Error(`No active deployment for "${serviceId}"`);

    const dependents= state.dependencies.filter((d)=> d.to === serviceId).map((d)=> d.from);
    const recovered= new Set([serviceId, ...dependents]);

    commit({
        services: state.services.map((s)=>
            recovered.has(s.id) ? {...s, status: "healthy", current: {...s.baseline}} : s,
        ),
        deployments: state.deployments.map((d)=> 
            d.id === active.id ? {...d, status: "rolled_back"} : d,
        ),
        incident: {...state.incident, status:"mitigating"},
        plans: state.plans.map((p)=> (p.id === planId ? { ...p, status: "used"} : p)),
    });
    return { ok: true, serviceId, fromVersion: active.version, toVersion, appliedAt: Date.now()};
}
export function evaluateRecovery(){
    const affected= state.services.filter((s)=> state.incident.affectedServiceIds.includes(s.id),);
    return { recovered: affected.every((s)=> s.status === "healthy"), affected};
}
export function resolveIncident(summary: string): void {
    commit({
        incident: {...state.incident, status: "resolved", resolutionSummary: summary},
    });
}