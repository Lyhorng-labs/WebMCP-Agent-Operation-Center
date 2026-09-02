"use client";

import { Panel } from "./Panel";
import { approvePlan, rejectPlan } from "../lib/ops/store";
import { useOps } from "../lib/ops/useOps";
import type { Plan } from "../lib/ops/types";

const RISK_TONE: Record<Plan["risk"], string> = {
  low: "text-emerald-400",
  medium: "text-amber-400",
  high: "text-red-400",
};

function ApprovalCard({ plan }: { plan: Plan }) {
  const pending = plan.status === "awaiting_approval";

  return (
    <div
      className={`rounded border p-3 transition-all duration-500 ${
        pending
          ? "ops-glow border-amber-500/40 bg-amber-500/3"
          : plan.status === "used"
            ? "border-emerald-500/30 bg-emerald-500/3"
            : "border-[#1a2130] bg-black/20"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">root cause</div>
      <div className="mt-0.5 text-[13px] text-zinc-100">{plan.rootCause}</div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">{plan.rationale}</p>

      <pre className="mt-2.5 overflow-x-auto rounded border border-white/5 bg-black/50 p-2 text-[10px] text-sky-300">
{plan.action}({JSON.stringify(plan.params, null, 0)})
      </pre>

      <div className="mt-2 flex gap-4 text-[10px] text-zinc-600">
        <span>
          risk <span className={RISK_TONE[plan.risk]}>{plan.risk}</span>
        </span>
        <span>
          recovery <span className="text-zinc-300">{plan.expectedRecovery}</span>
        </span>
      </div>

      {pending ? (
        <>
          <p className="mt-3 flex items-center gap-2 text-[11px] text-amber-400">
            <span className="ops-pulse h-1.5 w-1.5 rounded-full bg-amber-400" />
            Agent tool call is blocked, awaiting your decision
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={() => approvePlan(plan.id)}
              className="flex-1 rounded bg-emerald-600 px-3 py-2 text-[11px] font-semibold tracking-wider text-white transition hover:bg-emerald-500 active:scale-[0.98]"
            >
              APPROVE
            </button>
            <button
              onClick={() => rejectPlan(plan.id, "Operator rejected the plan.")}
              className="flex-1 rounded border border-[#1a2130] px-3 py-2 text-[11px] font-semibold tracking-wider text-zinc-400 transition hover:border-red-500/40 hover:text-red-400 active:scale-[0.98]"
            >
              REJECT
            </button>
          </div>
        </>
      ) : (
        <p className="mt-3 border-t border-white/5 pt-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          {plan.status === "used" ? "✓ executed" : plan.status}
          {plan.rejectionReason ? ` — ${plan.rejectionReason}` : ""}
        </p>
      )}
    </div>
  );
}

export function ApprovalPanel() {
  const { plans } = useOps();
  const waiting = plans.some((p) => p.status === "awaiting_approval");

  return (
    <Panel
      title="Remediation / Human Approval"
      accent={waiting}
      right={
        waiting ? (
          <span className="text-[10px] font-semibold tracking-wider text-amber-400">
            ACTION REQUIRED
          </span>
        ) : null
      }
    >
      {plans.length === 0 ? (
        <p className="py-2 text-[11px] text-zinc-600">
          No plan proposed. The agent must call propose_remediation before it can act.
        </p>
      ) : (
        plans.map((plan) => <ApprovalCard key={plan.id} plan={plan} />)
      )}
    </Panel>
  );
}
