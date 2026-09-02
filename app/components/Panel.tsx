import type { ReactNode } from "react";

export function Panel({
  title,
  accent,
  right,
  children,
}: {
  title: string;
  /** Renders a scanning highlight in the header, for panels the agent is driving. */
  accent?: boolean;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#1a2130] bg-[#0b0f16]/80 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
      <header className="relative flex items-center justify-between overflow-hidden border-b border-[#1a2130] bg-white/1.5 px-3 py-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          {title}
        </h2>
        {right}
        {accent && (
          <span className="ops-scan pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-linear-to-r from-transparent via-sky-400/10 to-transparent" />
        )}
      </header>
      <div className="space-y-2 p-3">{children}</div>
    </section>
  );
}
