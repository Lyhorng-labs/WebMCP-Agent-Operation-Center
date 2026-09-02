"use client";
import { Panel } from "./Panel";
import { useOps } from "../lib/ops/useOps";
import type { LogEntry } from "../lib/ops/types";
import { log } from "console";

const LEVEL_STYLE: Record<LogEntry["level"], string>={
    ERROR: "text-red-400",
    WARN:"text-amber-400",
    INFO: "text-zinc-600",
};
export function LogsPanel(){
    const { logs, logFilter }= useOps();
    const needle= logFilter?.contains?.toLocaleLowerCase();
    const visible= logs.filter((l)=> {
        if (!logFilter) return true;
        return(
            (!logFilter.serviceId || l.serviceId === logFilter.serviceId) &&
            (!logFilter.level || l.level === logFilter.level) &&
            (!needle || l.message.toLocaleLowerCase().includes(needle))
        );
    });
    return (
        <Panel title={`Log${logFilter ? " (filtered by agent)": ""}`}>
            {visible.map((l)=>(
                <div key={l.id} className="text-[11px]">
                    <span className={LEVEL_STYLE[l.level]}>{l.level}</span>{" "}
                    <span className="text-zinc-600">{l.serviceId}</span>{" "}
                    <span className="text-zinc-400">{l.message}</span>
                </div>
            ))}
        </Panel>
    );
}