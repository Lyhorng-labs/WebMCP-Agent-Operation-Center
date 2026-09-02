"use client";

import { Panel } from "./Panel";
import { useOps } from "../lib/ops/useOps";
import type { Dependency, Service } from "../lib/ops/types";

const W = 320;
const H = 190;
const BOX_W = 92;
const BOX_H = 22;

const NODE: Record<Service["status"], { fill: string; stroke: string; text: string }> = {
  healthy:  { fill: "#052e24", stroke: "#34d399", text: "#a7f3d0" },
  degraded: { fill: "#3a2606", stroke: "#fbbf24", text: "#fde68a" },
  down:     { fill: "#3d0c0c", stroke: "#f87171", text: "#fecaca" },
};

/**
 * Layer nodes by dependency depth: things nothing depends on sit at the top,
 * their dependencies below. This is what makes direction legible -- the agent's
 * "checkout depends on payments, so payments broke checkout" reads off the picture.
 */
function layout(services: Service[], deps: Dependency[]) {
  const depth = new Map<string, number>();

  const walk = (id: string, d: number, seen: Set<string>) => {
    if (seen.has(id)) return; // cycle guard
    depth.set(id, Math.max(depth.get(id) ?? 0, d));
    const next = new Set(seen).add(id);
    for (const edge of deps) if (edge.from === id) walk(edge.to, d + 1, next);
  };

  for (const s of services) {
    if (!deps.some((e) => e.to === s.id)) walk(s.id, 0, new Set());
  }
  for (const s of services) if (!depth.has(s.id)) depth.set(s.id, 0);

  const maxDepth = Math.max(0, ...depth.values());
  const byLayer = new Map<number, string[]>();
  for (const s of services) {
    const d = depth.get(s.id) ?? 0;
    byLayer.set(d, [...(byLayer.get(d) ?? []), s.id]);
  }

  const pos = new Map<string, { x: number; y: number }>();
  for (const [layer, ids] of byLayer) {
    ids.forEach((id, i) => {
      pos.set(id, {
        x: ((i + 1) / (ids.length + 1)) * W,
        y: maxDepth === 0 ? H / 2 : 20 + (layer / maxDepth) * (H - 44),
      });
    });
  }
  return pos;
}

export function DependenciesPanel() {
  const { services, dependencies, focusedServiceId } = useOps();
  const pos = layout(services, dependencies);

  return (
    <Panel title="Dependencies">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Service dependency graph">
        <defs>
          <marker id="dep-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#334155" />
          </marker>
          <marker id="dep-arrow-hot" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#38bdf8" />
          </marker>
        </defs>

        {dependencies.map((edge) => {
          const a = pos.get(edge.from);
          const b = pos.get(edge.to);
          if (!a || !b) return null;
          const hot = focusedServiceId === edge.from || focusedServiceId === edge.to;
          return (
            <line
              key={`${edge.from}->${edge.to}`}
              x1={a.x}
              y1={a.y + BOX_H / 2}
              x2={b.x}
              y2={b.y - BOX_H / 2 - 4}
              stroke={hot ? "#38bdf8" : "#334155"}
              strokeWidth={hot ? 1.6 : Math.max(0.5, Math.min(1.6, edge.callsPerMin / 2200))}
              markerEnd={hot ? "url(#dep-arrow-hot)" : "url(#dep-arrow)"}
              className="transition-all duration-300"
            />
          );
        })}

        {services.map((service) => {
          const p = pos.get(service.id);
          if (!p) return null;
          const tone = NODE[service.status];
          const focused = service.id === focusedServiceId;
          return (
            <g key={service.id} className="transition-all duration-500">
              <rect
                x={p.x - BOX_W / 2}
                y={p.y - BOX_H / 2}
                width={BOX_W}
                height={BOX_H}
                rx={4}
                fill={tone.fill}
                stroke={focused ? "#38bdf8" : tone.stroke}
                strokeWidth={focused ? 1.6 : 0.9}
              />
              <text
                x={p.x}
                y={p.y + 3}
                textAnchor="middle"
                fontSize="8"
                fill={tone.text}
                fontFamily="var(--font-geist-mono), monospace"
              >
                {service.id}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="pt-1 text-[10px] text-zinc-600">
        Arrows point from a service to what it depends on. Failures propagate upward.
      </p>
    </Panel>
  );
}
