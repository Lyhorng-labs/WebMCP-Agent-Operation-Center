"use client";

import { Panel } from "./Panel";
import { approvePlan, rejectPlan } from "../lib/ops/store";
import { useOps } from "../lib/ops/useOps";
import type { Plan } from "../lib/ops/types";

function ApprovalCard({plan}: {plan: Plan}){
    const pending= plan.status === "awaiting_approval";

    return (
        <div className="rounded border border-zinc-700 bg-zinc-900/80 p-3">
            <div className="text-sm text-zinc-200">{plan.rootCause}</div>
            <p className="mt-1 text-xs text-zinc-400">{plan.rationale}</p>

            <pre className="mt-2 flex gap-4 text-[11px] text-zinc-500">
                {plan.action}{JSON.stringify(plan.params)}
            </pre>

            <div className="mt-2 flex gap-4 text-[11px] text-zinc-500">
                <span>risk: {plan.risk}</span>
                <span>expected recovery: {plan.expectedRecovery}</span>
            </div>

            {pending ? (
                <>
                    <p className="mt-3 text-[11px] text-amber-400">
                        ⚠ Agent is blocked, waiting for your decision.
                    </p>
                    <div className="mt-2 flex gap-2">
                        <button onClick={()=> approvePlan(plan.id)}
                        className="flex-1 rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500">
                            APPROVE
                        </button>
                        <button
                        onClick={() => rejectPlan(plan.id, "Operator rejected the plan.")}
                        className="flex-1 rounded border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                        >
                        REJECT
                        </button>
                    </div>
                </>
            ):(
                <p className="mt-3 text-[11px] uppercase tracking-wider text-zinc-500">
                    {plan.status}
                    {plan.rejectionReason ? ` — ${plan.rejectionReason}` : ""}
                </p>
            )}
        </div>
    );
}
export function ApprovalPanel(){
    const {plans}= useOps();
    return (
        <Panel title="Remediation Plan / Approval">
            {plans.length=== 0 ? (
                <p className="text-[11px] text-zinc-600">No plan proposed.</p>
            ):(
                plans.map((plan)=> <ApprovalCard key={plan.id} plan={plan} />)
            )}
        </Panel>
    );
}