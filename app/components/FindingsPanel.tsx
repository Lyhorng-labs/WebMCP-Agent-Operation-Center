"use client";

import { Panel } from "./Panel";
import { useOps } from "../lib/ops/useOps";
import type { Finding } from "../lib/ops/types";

const CONFIDENCE: Record<Finding["confidence"], string> = {
  high: "border-emerald-500/40 text-emerald-400",
  medium: "border-amber-500/40 text-amber-400",
  low: "border-zinc-600 text-zinc-500",
};

export function FindingsPanel() {
  const { findings } = useOps();

  return (
    <Panel title="Findings">
      {findings.length === 0 ? (
        <p className="py-2 text-[11px] text-zinc-600">
          No findings recorded. The agent must cite evidence for each conclusion.
        </p>
      ) : (
        findings.map((f) => (
          <div key={f.id} className="rounded border border-[#141a26] bg-black/20 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[12px] leading-snug text-zinc-100">{f.summary}</div>
              <span
                className={`shrink-0 rounded border px-1.5 py-px text-[9px] uppercase tracking-wider ${CONFIDENCE[f.confidence]}`}
              >
                {f.confidence}
              </span>
            </div>
            <ul className="mt-2 space-y-1 border-l border-[#1a2130] pl-2.5">
              {f.evidence.map((e, i) => (
                <li key={i} className="text-[10px] leading-relaxed text-zinc-500">
                  {e}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </Panel>
  );
}
