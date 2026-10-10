import { Icon } from "@/components/ui/icon";

const navButton = "flex size-11 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2 hover:text-text";

/** Intestazione di Settimana e Mese: titolo del periodo, avanti/indietro e ritorno a oggi. */
export function CalendarHeader({
  eyebrow,
  title,
  muted,
  prevLabel,
  nextLabel,
  showToday,
  onPrev,
  onNext,
  onToday,
}: {
  eyebrow: string;
  title: string;
  muted?: string;
  prevLabel: string;
  nextLabel: string;
  showToday: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <header className="flex items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="label-mono">{eyebrow}</span>
        <h1 className="text-[30px] font-light leading-[1.05] tracking-[-0.02em] md:text-[40px]">
          {title} {muted ? <span className="text-text-3">{muted}</span> : null}
        </h1>
      </div>
      <div className="-mr-2.5 flex shrink-0 items-center">
        {showToday ? (
          <button type="button" onClick={onToday} className="min-h-11 rounded-lg px-2.5 text-[13px] text-accent hover:bg-surface-2">
            Oggi
          </button>
        ) : null}
        <button type="button" onClick={onPrev} aria-label={prevLabel} className={navButton}>
          <Icon name="chevronLeft" />
        </button>
        <button type="button" onClick={onNext} aria-label={nextLabel} className={navButton}>
          <Icon name="chevronRight" />
        </button>
      </div>
    </header>
  );
}

export function CalendarError({ offline, onRetry }: { offline: boolean; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-[14px] border border-line-2 px-4 py-3 text-sm">
      <p>{offline ? "Questo periodo non è disponibile senza rete: offline trovi quelli che hai già aperto." : "Non riesco a caricare il calendario. Controlla la connessione."}</p>
      <button type="button" onClick={onRetry} className="-ml-2.5 min-h-11 rounded-lg px-2.5 text-accent hover:bg-surface-2">
        Riprova
      </button>
    </div>
  );
}
