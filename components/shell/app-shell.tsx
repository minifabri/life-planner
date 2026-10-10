"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useCapture } from "@/components/capture/capture-provider";
import { SyncStatus } from "@/components/data/sync-status";
import { Icon, type IconName } from "@/components/ui/icon";
import { useIcloudAutoSync } from "@/lib/icloud/hooks";
import { useImayogaAutoSync } from "@/lib/imayoga/hooks";

type NavItem = { href: string; label: string; icon: IconName; match: string[] };

const MOBILE_NAV: NavItem[] = [
  { href: "/today", label: "Oggi", icon: "sun", match: ["/today", "/workouts"] },
  { href: "/calendar/week", label: "Calendario", icon: "calendar", match: ["/calendar"] },
  { href: "/lists/shopping", label: "Liste", icon: "list", match: ["/lists"] },
  { href: "/log", label: "Log", icon: "journal", match: ["/log"] },
];

const DESKTOP_NAV: NavItem[] = [
  { href: "/today", label: "Oggi", icon: "sun", match: ["/today", "/workouts"] },
  { href: "/calendar/week", label: "Calendario", icon: "calendar", match: ["/calendar"] },
  { href: "/lists/shopping", label: "Spesa", icon: "list", match: ["/lists/shopping"] },
  { href: "/lists/meals", label: "Pasti", icon: "meal", match: ["/lists/meals"] },
  { href: "/lists/wishlist", label: "Wishlist", icon: "heart", match: ["/lists/wishlist"] },
  { href: "/log", label: "Log", icon: "journal", match: ["/log"] },
];

function isActive(pathname: string, item: NavItem) {
  return item.match.some((m) => pathname === m || pathname.startsWith(m + "/"));
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const capture = useCapture();
  useIcloudAutoSync();
  useImayogaAutoSync();

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col gap-6 border-r border-line px-3.5 py-5 md:flex">
        <div className="flex items-center gap-2.5 px-2.5">
          <span className="size-3.5 rounded-[4px] bg-accent-fill shadow-[0_0_0_3px_var(--accent-soft)]" />
          <span className="font-mono text-[13px] tracking-[0.08em]">planner</span>
        </div>
        <button
          type="button"
          onClick={() => capture()}
          aria-keyshortcuts="N"
          className="flex min-h-11 items-center gap-2.5 rounded-[10px] border border-line bg-surface px-2.5 text-left text-[13px] text-text-3 hover:text-text"
        >
          <Icon name="plus" size={15} />
          <span className="flex-1">Aggiungi</span>
          <kbd className="rounded-[5px] border border-line-2 px-1.5 font-mono text-[10.5px]">N</kbd>
        </button>
        <nav aria-label="Sezioni" className="flex flex-col gap-0.5">
          {DESKTOP_NAV.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[38px] items-center gap-3 rounded-[9px] px-2.5 text-sm transition-colors ${
                  active ? "bg-surface-2 text-text" : "text-text-2 hover:bg-surface-2 hover:text-text"
                }`}
              >
                <Icon name={item.icon} size={16} className={active ? "text-accent" : undefined} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <Link
          href="/settings"
          aria-current={pathname.startsWith("/settings") ? "page" : undefined}
          className="flex min-h-[38px] items-center gap-3 rounded-[9px] px-2.5 text-sm text-text-2 hover:bg-surface-2 hover:text-text"
        >
          <Icon name="settings" size={16} />
          Impostazioni
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 pb-[calc(88px+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] md:pb-0">
          <SyncStatus />
          {children}
        </main>

        {/* Bottom navigation mobile */}
        <nav
          aria-label="Navigazione principale"
          className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 items-center border-t border-line bg-bg px-1.5 pb-[calc(8px+env(safe-area-inset-bottom))] pt-1.5 md:hidden"
        >
          {MOBILE_NAV.slice(0, 2).map((item) => (
            <MobileNavLink key={item.href} item={item} active={isActive(pathname, item)} />
          ))}
          <button
            type="button"
            onClick={() => capture()}
            aria-label="Aggiungi"
            className="mx-auto flex size-[54px] items-center justify-center rounded-[18px] bg-accent-fill text-on-accent"
          >
            <Icon name="plus" size={24} strokeWidth={1.8} />
          </button>
          {MOBILE_NAV.slice(2).map((item) => (
            <MobileNavLink key={item.href} item={item} active={isActive(pathname, item)} />
          ))}
        </nav>
      </div>
    </div>
  );
}

function MobileNavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-[52px] flex-col items-center justify-center gap-1 text-[10.5px] tracking-[0.02em] ${
        active ? "text-text" : "text-text-3"
      }`}
    >
      <Icon name={item.icon} size={22} className={active ? "text-accent" : undefined} />
      {item.label}
    </Link>
  );
}
