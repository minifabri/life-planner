"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SegmentedNav({ label, items }: { label: string; items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="flex gap-0.5 rounded-xl border border-line bg-surface p-[3px]">
      {items.map((it) => {
        const active = pathname === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-9 flex-1 items-center justify-center rounded-[9px] text-[13px] transition-colors ${
              active ? "bg-surface-2 text-text" : "text-text-2 hover:text-text"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
