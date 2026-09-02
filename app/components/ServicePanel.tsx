"use client";
import { Panel } from "./Panel";
import { useOps } from "../lib/ops/useOps";
import type { Service } from "../lib/ops/types";

const pct= (n:number)=> `${(n*100).toFixed(1)}%`;
const STATUS_STYLE: Record<Service["status"], string>={
    healthy:"border-emerald-500/40 text-emerald-400",
    degraded: "border-amber-500/40 text-amber-400",
    down: "border-red-500/40 text-red-400",
};
function ServiceRow({service, focused}: {service: Service, focused: boolean}){
    return (
        <div className={`rounded border px-3 py-2 transition ${STATUS_STYLE[service.status]} ${
            focused ? "bg-zinc-800 ring-1 ring-sky-400" : "bg-zinc-900/60"}`}>
                <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-200">{service.name}</span>
                    <span className="text-[10px] uppercase tracking-widest">{service.status}</span>
                </div>
                <div className="flex items-center justify-between">
                    <span>success {pct(service.current.successRate)}</span>
                    <span>errors {pct(service.current.errorRate)}</span>
                    <span>
                        p95 {service.current.p95Ms}ms
                        <span className="text-zinc-600"> / {service.baseline.p95Ms} base</span>
                    </span>
                </div>
        </div>
    );
}
export function ServicesPanel(){
    const {services, focusedServiceId }= useOps();
    return (
        <Panel title="Production Service">
            {services.map((service)=> (
                <ServiceRow key={service.id} service={service} focused={service.id === focusedServiceId} />
            ))}
        </Panel>
    );
}