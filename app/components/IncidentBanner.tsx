"use client";

import { useOps } from "../lib/ops/useOps";

export function IncidentBanner() {
  const { incident } = useOps();
  const resolved = incident.status === "resolved";
  const mitigating = incident.status === "mitigating";

  const tone = resolved
    ? "border-emerald-500/40 bg-emerald-500/[0.04]"
    : mitigating
      ? "border-sky-500/40 bg-sky-500/[0.04]"
      : "border-red-500/40 bg-red-500/[0.05]";

  const dot = resolved ? "bg-emerald-400" : mitigating ? "bg-sky-400" : "bg-red-500 ops-pulse";
  const label = resolved ? "text-emerald-400" : mitigating ? "text-sky-400" : "text-red-400";

  return (
    <div className={`mb-4 rounded-lg border p-4 transition-colors duration-700 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] tracking-[0.2em] text-zinc-500">{incident.id}</span>
              <span className="text-base text-zinc-100">{incident.title}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500">
              started {incident.startedMinutesAgo}m ago · affected{" "}
              {incident.affectedServiceIds.join(", ")}
            </div>
          </div>
        </div>

        <span
          className={`rounded border border-current/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${label}`}
        >
          {incident.status}
        </span>
      </div>

      {incident.resolutionSummary && (
        <p className="mt-3 border-t border-white/5 pt-3 text-xs text-zinc-400">
          {incident.resolutionSummary}
        </p>
      )}
    </div>
  );
}
