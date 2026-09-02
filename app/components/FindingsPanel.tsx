"use client";

import { Panel } from "./Panel";
import { useOps } from "../lib/ops/useOps";

export function FindingsPanel() {
  const { findings } = useOps();

  return (
    <Panel title="Findings">
      {findings.length === 0 ? (
        <p className="text-[11px] text-zinc-600">No findings recorded.</p>
      ) : (
        findings.map((f) => (
          <div key={f.id} className="rounded border border-zinc-800 p-2">
            <div className="text-xs text-zinc-200">{f.summary}</div>
            <ul className="mt-1 space-y-0.5">
              {f.evidence.map((e, i) => (
                <li key={i} className="text-[11px] text-zinc-500">• {e}</li>
              ))}
            </ul>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-600">
              confidence: {f.confidence}
            </div>
          </div>
        ))
      )}
    </Panel>
  );
}