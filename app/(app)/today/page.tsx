"use client";

import Link from "next/link";
import { todayHeading } from "@/lib/dates/today";
import { EmptyState } from "@/components/ui/page-header";
import { Icon } from "@/components/ui/icon";

export default function TodayPage() {
  const h = todayHeading();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-5 md:px-10 md:py-7">
      <header className="flex items-end justify-between">
        <div className="flex flex-col gap-1.5">
          <span className="label-mono">Oggi · Settimana {h.week}</span>
          <h1 className="text-[34px] font-light leading-[1.05] tracking-[-0.02em] md:text-[40px]">
            {h.weekday} <span className="text-text-3">{h.dayMonth}</span>
          </h1>
        </div>
        <div className="-mr-2.5 flex">
          <button aria-label="Giorno precedente" className="flex size-11 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2 hover:text-text">
            <Icon name="chevronLeft" />
          </button>
          <button aria-label="Giorno successivo" className="flex size-11 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2 hover:text-text">
            <Icon name="chevronRight" />
          </button>
          <Link href="/settings" aria-label="Impostazioni" className="flex size-11 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2 hover:text-text md:hidden">
            <Icon name="settings" />
          </Link>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="label-mono">Agenda</h2>
        <EmptyState title="Niente in programma." hint="Gli appuntamenti e le attività con orario compariranno qui." />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="label-mono">Da fare oggi</h2>
        <EmptyState title="Giornata libera." hint="Tocca + per aggiungere qualcosa." />
      </section>

      <p className="text-xs text-text-3">Incremento 0: struttura dell’app. Le attività arrivano con l’incremento 1.</p>
    </div>
  );
}
