"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { useProfile } from "@/lib/data/hooks";
import { flushPendingTours, markTourSeen, pendingTours } from "@/lib/data/tour";
import { TOURS, autoTour, padRect, placeCard, unionRect, visibleSteps, type CardPlacement, type Rect, type TourId, type TourStep } from "@/lib/tour/tour";

/** Pagina su cui gira ogni tour: gli elementi da evidenziare stanno lì. */
export const TOUR_PAGE: Record<TourId, string> = {
  intro: "/today",
  calendar: "/calendar/week",
  shopping: "/lists/shopping",
  meals: "/lists/meals",
  wishlist: "/lists/wishlist",
  wardrobe: "/lists/wardrobe",
  log: "/log",
};

const TourContext = createContext<(id: TourId) => void>(() => {});

/** Avvia un tour, anche già visto (es. "Rivedi il tour" dalle Impostazioni). */
export function useStartTour() {
  return useContext(TourContext);
}

/** Gli elementi `[data-tour=target]` visibili adesso: quelli nascosti (es. la barra mobile su desktop) non contano. */
function targetElements(target: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)].filter((el) => el.getClientRects().length > 0);
}

function targetRect(target: string | undefined): Rect | null {
  if (!target) return null;
  return unionRect(
    targetElements(target).map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    }),
  );
}

/**
 * Aspetta che la pagina mostri gli elementi del tour: tutti, oppure il primo più un attimo per i dati
 * che arrivano dopo (es. la lista della spesa); al massimo due secondi. Quelli che mancano ancora si saltano.
 */
function waitForTargets(steps: TourStep[]): Promise<void> {
  const targets = [...new Set(steps.flatMap((s) => (s.target ? [s.target] : [])))];
  return new Promise((resolve) => {
    const started = performance.now();
    let firstSeen: number | null = null;
    const check = () => {
      const now = performance.now();
      const shown = targets.filter((t) => targetElements(t).length > 0);
      if (firstSeen === null && targets.length > 0 && shown[0] === targets[0]) firstSeen = now;
      const settled = firstSeen !== null && now - firstSeen > 800;
      if (shown.length === targets.length || settled || now - started > 2000) resolve();
      else requestAnimationFrame(check);
    };
    check();
  });
}

export function TourProvider({ children }: { children: ReactNode }) {
  const profile = useProfile();
  const pathname = usePathname();
  const router = useRouter();
  const [requested, setRequested] = useState<TourId | null>(null);
  const [active, setActive] = useState<{ id: TourId; steps: TourStep[] } | null>(null);
  // Visti offline e non ancora salvati sul profilo: contano come visti.
  const [pending] = useState(pendingTours);

  useEffect(() => {
    if (profile) void flushPendingTours();
  }, [profile]);

  // Tour iniziale arrivando su Oggi; dopo, il tour di ogni sezione la prima volta che la si apre.
  const wanted = requested ?? (profile ? autoTour([...(profile.tours_seen ?? []), ...pending], pathname, TOUR_PAGE) : null);

  const start = useCallback(
    (id: TourId) => {
      setRequested(id);
      if (pathname !== TOUR_PAGE[id]) router.push(TOUR_PAGE[id]);
    },
    [pathname, router],
  );

  useEffect(() => {
    if (!wanted || active || pathname !== TOUR_PAGE[wanted]) return;
    let cancelled = false;
    void waitForTargets(TOURS[wanted]).then(() => {
      if (cancelled) return;
      setRequested(null);
      const steps = visibleSteps(TOURS[wanted], (t) => targetElements(t).length > 0);
      // Sezione ancora vuota (es. nessun articolo): niente da mostrare, il tour aspetta la prossima volta.
      if (steps.length === 0) return;
      setActive({ id: wanted, steps });
    });
    return () => {
      cancelled = true;
    };
  }, [wanted, active, pathname]);

  const finish = useCallback(() => {
    if (!active) return;
    void markTourSeen(active.id);
    setActive(null);
  }, [active]);

  return (
    <TourContext.Provider value={start}>
      {children}
      {active ? <TourOverlay key={active.id} steps={active.steps} onFinish={finish} /> : null}
    </TourContext.Provider>
  );
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function TourOverlay({ steps, onFinish }: { steps: TourStep[]; onFinish: () => void }) {
  const [index, setIndex] = useState(0);
  const [hole, setHole] = useState<Rect | null>(null);
  const [place, setPlace] = useState<CardPlacement | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  // Porta l'elemento nello schermo, se serve, poi misura riflettore e fumetto; di nuovo a ogni scroll o rotazione.
  useLayoutEffect(() => {
    const first = step.target ? targetElements(step.target)[0] : undefined;
    if (first) {
      const r = first.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) {
        first.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      }
    }
    const measure = () => {
      const target = targetRect(step.target);
      const padded = target ? padRect(target, 6) : null;
      setHole(padded);
      setPlace(
        placeCard({
          target: padded,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          card: { height: card.current?.offsetHeight ?? 200 },
        }),
      );
    };
    measure();
    // Il fumetto cambia altezza con il testo: una seconda misura dopo il disegno.
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  // Il fuoco va sul pulsante principale a ogni passo, così si può proseguire con Invio.
  useEffect(() => {
    card.current?.querySelector<HTMLButtonElement>("[data-tour-next]")?.focus({ preventScroll: true });
  }, [index]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onFinish();
    } else if (e.key === "ArrowRight" && !last) {
      setIndex((i) => i + 1);
    } else if (e.key === "ArrowLeft" && index > 0) {
      setIndex((i) => i - 1);
    } else if (e.key === "Tab") {
      // Il fuoco resta nel fumetto finché il tour è aperto.
      const buttons = [...(card.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = (at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      e.preventDefault();
      buttons[next]?.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50" onKeyDown={onKeyDown}>
      {/* Lo strato scuro: un riquadro trasparente con un'ombra enorme attorno, oppure tutto scuro se il passo non ha elemento. */}
      {hole ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-[14px] shadow-[0_0_0_200vmax_var(--scrim)] outline outline-2 outline-offset-0 outline-accent transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{ left: hole.left, top: hole.top, width: hole.width, height: hole.height }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-scrim" />
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="fixed flex flex-col gap-3 rounded-[18px] border border-line-2 bg-surface p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] transition-[top,left] duration-300 ease-out motion-reduce:transition-none"
        style={place ? { left: place.left, top: place.top, width: place.width } : { opacity: 0 }}
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="label-mono">
              Guida · {index + 1} di {steps.length}
            </span>
            <span className="flex items-center gap-2">
              <ol aria-hidden className="flex items-center gap-1">
                {steps.map((s, i) => (
                  <li key={i} className={`h-1.5 rounded-full transition-all motion-reduce:transition-none ${i === index ? "w-4 bg-accent" : "w-1.5 bg-line-2"}`} />
                ))}
              </ol>
              {/* La X chiude la guida in qualsiasi momento: conta come vista, come Esc. */}
              <button
                type="button"
                onClick={onFinish}
                aria-label="Chiudi la guida"
                className="-my-2.5 -mr-2.5 flex size-11 items-center justify-center rounded-xl text-text-3 hover:bg-surface-2 hover:text-text"
              >
                <Icon name="close" size={18} />
              </button>
            </span>
          </div>
          <h2 id="tour-title" className="text-[17px] font-medium leading-snug">
            {step.title}
          </h2>
          <p id="tour-body" aria-live="polite" className="text-sm leading-relaxed text-text-2">
            {step.body}
          </p>
        </div>
        <div className="-mx-1 -mb-1 flex items-center gap-1">
          <span className="flex-1" />
          {index > 0 ? (
            <Button variant="quiet" onClick={() => setIndex((i) => i - 1)} className="px-3">
              Indietro
            </Button>
          ) : null}
          <NextButton label={last ? "Ho capito" : index === 0 && !step.target ? "Inizia" : "Avanti"} onClick={() => (last ? onFinish() : setIndex((i) => i + 1))} />
        </div>
      </div>
    </div>
  );
}

function NextButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" data-tour-next onClick={onClick} className="min-h-11 rounded-xl bg-accent-fill px-4 text-sm font-medium text-on-accent">
      {label}
    </button>
  );
}
