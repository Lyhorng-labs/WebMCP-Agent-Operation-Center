"use client";

import { Panel } from "./Panel";
import { useOps } from "../lib/ops/useOps";

export function DependenciesPanel() {
  const { dependencies } = useOps();
  return (
    <Panel title="Dependencies">
      {dependencies.map((d) => (
        <div key={`${d.from}->${d.to}`} className="text-[11px] text-zinc-400">
          {d.from} <span className="text-zinc-600">→</span> {d.to}
          <span className="text-zinc-600"> ({d.callsPerMin}/min)</span>
        </div>
      ))}
    </Panel>
  );
}