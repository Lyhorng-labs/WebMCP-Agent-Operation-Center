"use client";

import { Panel } from "./Panel";
import { useOps } from "../lib/ops/useOps";
import type { Service } from "../lib/ops/types";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const TONE: Record<Service["status"], { text: string; bar: string; edge: string }> = {
  healthy:  { text: "text-emerald-400", bar: "bg-emerald-400", edge: "border-emerald-500/30" },
  degraded: { text: "text-amber-400",   bar: "bg-amber-400",   edge: "border-amber-500/30" },
  down:     { text: "text-red-400",     bar: "bg-red-500",     edge: "border-red-500/30" },
};

function ServiceRow({ service, focused }: { service: Service; focused: boolean }) {
  const tone = TONE[service.status];
  const ratio = service.baseline.p95Ms
    ? service.current.p95Ms / service.baseline.p95Ms
    : 1;

  return (
    <div
      className={`relative rounded border bg-black/20 px-3 py-2.5 transition-all duration-700 ${tone.edge} ${
        focused ? "ring-1 ring-sky-400/70 shadow-[0_0_20px_-6px_rgba(56,189,248,0.6)]" : ""
      }`}
    >
      {focused && (
        <span className="absolute -top-px left-3 -translate-y-1/2 rounded-full bg-sky-500/90 px-1.5 py-px text-[8px] font-semibold uppercase tracking-widest text-sky-950">
          agent
        </span>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[13px] text-zinc-200">{service.name}</span>
        <span className={`text-[9px] font-semibold uppercase tracking-[0.18em] ${tone.text}`}>
          {service.status}
        </span>
      </div>

      {/* Success-rate bar: the fastest read of "is this service okay". */}
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full transition-all duration-700 ${tone.bar}`}
          style={{ width: `${service.current.successRate * 100}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-zinc-500">
        <span>
          success <span className="text-zinc-300">{pct(service.current.successRate)}</span>
        </span>
        <span>
          errors <span className="text-zinc-300">{pct(service.current.errorRate)}</span>
        </span>
        <span>
          p95 <span className="text-zinc-300">{service.current.p95Ms}ms</span>
          <span className="text-zinc-600"> / {service.baseline.p95Ms} base</span>
          {ratio >= 1.5 && (
            <span className={`ml-1 ${tone.text}`}>{ratio.toFixed(1)}×</span>
          )}
        </span>
      </div>
    </div>
  );
}

export function ServicesPanel() {
  const { services, focusedServiceId } = useOps();
  const unhealthy = services.filter((s) => s.status !== "healthy").length;

  return (
    <Panel
      title="Production Services"
      right={
        <span className="text-[10px] text-zinc-600">
          {unhealthy > 0 ? (
            <span className="text-amber-400">{unhealthy} degraded</span>
          ) : (
            <span className="text-emerald-400">all healthy</span>
          )}
        </span>
      }
    >
      {services.map((service) => (
        <ServiceRow
          key={service.id}
          service={service}
          focused={service.id === focusedServiceId}
        />
      ))}
    </Panel>
  );
}
