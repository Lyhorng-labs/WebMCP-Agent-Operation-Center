import type { ReactNode } from "react";

export function Panel({title, children}: {title: string; children: ReactNode}){
    return (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40">
            <h2 className="border-b border-zinc-800 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
                {title}
            </h2>
            <div className="space-y-2 p-3">{children}</div>
        </section>
    );
}