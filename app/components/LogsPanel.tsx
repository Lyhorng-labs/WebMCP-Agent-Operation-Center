"use client";

import { Panel } from "./Panel";
import { useOps } from "../lib/ops/useOps";
import type { LogEntry } from "../lib/ops/types";

const LEVEL: Record<LogEntry["level"], string> = {
  ERROR: "bg-red-500/15 text-red-400",
  WARN: "bg-amber-500/15 text-amber-400",
  INFO: "bg-white/5 text-zinc-500",
};

export function LogsPanel() {
  const { logs, logFilter } = useOps();

  const needle = logFilter?.contains?.toLowerCase();
  const visible = logs.filter((l) => {
    if (!logFilter) return true;
    return (
      (!logFilter.serviceId || l.serviceId === logFilter.serviceId) &&
      (!logFilter.level || l.level === logFilter.level) &&
      (!needle || l.message.toLowerCase().includes(needle))
    );
  });

  const filterLabel = logFilter
    ? [
        logFilter.serviceId,
        logFilter.level,
        logFilter.contains ? `"${logFilter.contains}"` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <Panel
      title="Logs"
      accent={Boolean(logFilter)}
      right={
        filterLabel ? (
          <span className="truncate text-[10px] text-sky-400">
            agent filter: {filterLabel}
          </span>
        ) : (
          <span className="text-[10px] text-zinc-600">{logs.length} entries</span>
        )
      }
    >
      {visible.length === 0 ? (
        <p className="py-2 text-[11px] text-zinc-600">No log entries match the filter.</p>
      ) : (
        visible.map((l) => (
          <div key={l.id} className="flex items-start gap-2 text-[10px] leading-relaxed">
            <span className="shrink-0 text-zinc-700">{l.atMinutesAgo}m</span>
            <span className={`shrink-0 rounded px-1 font-semibold ${LEVEL[l.level]}`}>
              {l.level}
            </span>
            <span className="shrink-0 text-zinc-600">{l.serviceId}</span>
            <span className="text-zinc-300">{l.message}</span>
          </div>
        ))
      )}
    </Panel>
  );
}
