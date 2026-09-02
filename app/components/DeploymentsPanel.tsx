"use client";

import { Panel } from "./Panel";
import { useOps } from "../lib/ops/useOps";

export function DeploymentsPanel() {
  const { deployments } = useOps();
  return (
    <Panel title="Deployments">
      {deployments.map((d) => (
        <div key={d.id} className="text-[11px]">
          <div className="flex justify-between">
            <span className={d.status === "rolled_back" ? "text-amber-400 line-through" : "text-zinc-300"}>
              {d.serviceId} {d.version}
            </span>
            <span className="text-zinc-600">{d.deployedMinutesAgo}m ago</span>
          </div>
          <div className="text-zinc-600">
            {d.id} · from {d.previousVersion ?? "—"} · {d.author}
          </div>
        </div>
      ))}
    </Panel>
  );
}