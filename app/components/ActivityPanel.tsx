"use client";

import { Panel } from "./Panel";
import { useOps } from "../lib/ops/useOps";
import type { ToolCall } from "../lib/ops/types";

function Marker({ status }: { status: ToolCall["status"] }) {
  if (status === "pending") {
    return (
      <span className="ops-spin mt-0.5 block h-2.5 w-2.5 rounded-full border border-sky-400 border-t-transparent" />
    );
  }
  return (
    <span
      className={`mt-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full text-[7px] ${
        status === "ok"
          ? "bg-emerald-500/20 text-emerald-400"
          : "bg-red-500/20 text-red-400"
      }`}
    >
      {status === "ok" ? "✓" : "✗"}
    </span>
  );
}

export function ActivityPanel() {
  const { toolCalls } = useOps();
  const busy = toolCalls.some((c) => c.status === "pending");

  return (
    <Panel
      title="Agent Activity"
      accent={busy}
      right={
        <span className="text-[10px] text-zinc-600">
          {toolCalls.length} call{toolCalls.length === 1 ? "" : "s"}
        </span>
      }
    >
      {toolCalls.length === 0 ? (
        <p className="py-2 text-[11px] text-zinc-600">
          Waiting for the agent. Tool calls will appear here.
        </p>
      ) : (
        <ol className="relative space-y-2.5 pl-1">
          {/* Timeline spine */}
          <span className="absolute bottom-2 left-1.25 top-2 w-px bg-[#1a2130]" />
          {toolCalls.map((call) => (
            <li key={call.id} className="relative flex gap-2.5">
              <span className="z-10 bg-[#0b0f16]">
                <Marker status={call.status} />
              </span>
              <div className="min-w-0 flex-1 -mt-0.5">
                <div className="truncate text-[11px] text-zinc-300">
                  {call.note ?? call.tool}
                </div>
                <div className="truncate font-mono text-[10px] text-zinc-600">{call.tool}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
