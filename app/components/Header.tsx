"use client";
import { resetDemo } from "../lib/ops/store";
import { useOps } from "../lib/ops/useOps";
import { TOOL_NAMES } from "../webmcp/tools";

export function Header(){
    const {webmcp}= useOps();
    return (
        <header className="mb-4 flex items-center justify-between">
            <h1 className="text-sm tracking-widest text-zinc-400">
                AGENT OPERATIONS CENTER
            </h1>
            <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                {webmcp.available ? (
                    <span className="text-emerald-400"> 
                        {webmcp.registered.length}/{TOOL_NAMES.length} WebMCP tools registered
                    </span>
                ): (
                    <span className="text-amber-400">document.modelContext unavailable</span>
                )}
                <button onClick={resetDemo} className="rounded border border-zince-800 px-2 py-1 hover:bg-zinc-900">
                    reset demo
                </button>
            </div>
        </header>
    );
}