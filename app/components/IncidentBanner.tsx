"use client";
import { useOps } from "../lib/ops/useOps";
export function IncidentBanner(){
    const { incident }= useOps();
    const tone= incident.status === "resolved" ?
    "border-emerald-500/40 text-emerald-400" : incident.status === "mitigating"
    ? "border-sky-500/40 text-sky-400" : "border-red-500/40 text-red-400";
    return (
        <div className={`mb-4  rounded-lg border bg-zinc-900/40 p-4 ${tone}`}>
            <div className="flex items-baseline justify-between">
                <span className="text-lg">
                    {incident.status === "resolved" ? "✅" : "🚨"} {incident.id} - {incident.title}
                </span>
                <span className="text-xs uppercase tracking-widest">{incident.status}</span>
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">
                started {incident.startedMinutesAgo}m ago · affected: {incident.affectedServiceIds.join(", ")}
            </div>
            {incident.resolutionSummary && (
                <p className="mt-2 text-xs text-zinc-400">{incident.resolutionSummary}</p>
            )}
        </div>
    );
}