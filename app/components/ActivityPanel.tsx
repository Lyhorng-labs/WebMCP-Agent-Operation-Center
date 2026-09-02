"use client";
import { Panel } from "./Panel";
import { useOps } from "../lib/ops/useOps";
import type { ToolCall } from "../lib/ops/types";

const MARK: Record<ToolCall["status"], {glyph: string; color: string}>={
    ok:{glyph:"✓", color: "text-emerald-400" },
    error: { glyph: "✗", color: "text-red-400" },
    pending: { glyph: "…", color: "text-sky-400" },
};
export function ActivityPanel(){
    const {toolCalls}= useOps();
    return (
        <Panel title="Agent Activity">
            {toolCalls.length===0 ? (
                <p className="text-[11px] text-zinc-600">No tool calls yet.l</p>
            ): (
                toolCalls.map((call)=>{
                    const { glyph, color}= MARK[call.status];
                    return(
                        <div key={call.id} className="flex gap-2 text-[11px]">
                            <span className={color}>{glyph}</span>
                            <div className="min-w-0">
                                <div className="text-zinc-300">{call.note ?? call.tool}</div>
                                <div className="truncate text-zinc-600">{call.tool}</div>
                            </div>
                        </div>
                    );
                })
            )}
        </Panel>
    );

}