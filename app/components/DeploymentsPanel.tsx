"use client";

import { Panel } from "./Panel";
import { useOps } from "../lib/ops/useOps";

export function DeploymentsPanel() {
  const { deployments, incident, focusedServiceId } = useOps();

  return (
    <Panel title="Deployments">
      {deployments.map((d) => {
        const rolledBack = d.status === "rolled_back";
        const suspect =
          !rolledBack &&
          d.status === "active" &&
          d.deployedMinutesAgo >= incident.startedMinutesAgo &&
          d.deployedMinutesAgo - incident.startedMinutesAgo <= 15;

        return (
          <div
            key={d.id}
            className={`rounded border px-2.5 py-2 transition-colors duration-500 ${
              focusedServiceId === d.serviceId
                ? "border-sky-500/40 bg-sky-500/4"
                : "border-[#141a26] bg-black/20"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={`truncate text-[11px] ${
                  rolledBack ? "text-amber-400 line-through" : "text-zinc-200"
                }`}
              >
                {d.serviceId} <span className="text-zinc-500">{d.version}</span>
              </span>
              <span className="shrink-0 text-[10px] text-zinc-600">
                {d.deployedMinutesAgo}m ago
              </span>
            </div>

            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-600">
              <span>{d.id}</span>
              <span>·</span>
              <span>from {d.previousVersion ?? "—"}</span>
              <span>·</span>
              <span>{d.author}</span>
              {suspect && (
                <span className="rounded bg-amber-500/15 px-1 text-[9px] tracking-wider text-amber-400">
                  PRE-INCIDENT
                </span>
              )}
              {rolledBack && (
                <span className="rounded bg-emerald-500/15 px-1 text-[9px] tracking-wider text-emerald-400">
                  ROLLED BACK
                </span>
              )}
            </div>

            <div className="mt-1 truncate text-[10px] text-zinc-500">{d.summary}</div>
          </div>
        );
      })}
    </Panel>
  );
}
