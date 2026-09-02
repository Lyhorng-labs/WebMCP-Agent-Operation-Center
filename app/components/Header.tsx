"use client";

import { resetDemo } from "../lib/ops/store";
import { useOps } from "../lib/ops/useOps";
import { TOOL_NAMES } from "../webmcp/tools";

export function Header() {
  const { webmcp } = useOps();
  const live = webmcp.available;

  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-sm font-semibold tracking-[0.28em] text-zinc-200">
          AGENT OPERATIONS CENTER
        </h1>
        <span className="hidden text-[10px] tracking-wider text-zinc-600 sm:inline">
          human-supervised incident response
        </span>
      </div>

      <div className="flex items-center gap-3 text-[11px]">
        <span
          className={`flex items-center gap-2 rounded-full border px-2.5 py-1 ${
            live
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
              : "border-amber-500/30 bg-amber-500/5 text-amber-400"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              live ? "bg-emerald-400 ops-pulse" : "bg-amber-400"
            }`}
          />
          {live
            ? `WebMCP live · ${webmcp.registered.length}/${TOOL_NAMES.length} tools`
            : "document.modelContext unavailable"}
        </span>

        <button
          onClick={resetDemo}
          className="rounded border border-[#1a2130] px-2.5 py-1 text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-300"
        >
          reset demo
        </button>
      </div>
    </header>
  );
}
