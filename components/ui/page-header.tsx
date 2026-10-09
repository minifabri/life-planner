import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  muted,
  actions,
}: {
  eyebrow: string;
  title: string;
  muted?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="label-mono">{eyebrow}</span>
        <h1 className="text-[30px] font-light leading-[1.05] tracking-[-0.02em] md:text-[40px]">
          {title} {muted ? <span className="text-text-3">{muted}</span> : null}
        </h1>
      </div>
      {actions}
    </header>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[14px] border border-dashed border-line-2 px-5 py-8 text-center">
      <p className="text-[15px] text-text">{title}</p>
      <p className="text-sm text-text-3">{hint}</p>
    </div>
  );
}
