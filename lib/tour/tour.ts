/**
 * Tour guidato (D65): passi, stato "già visto" e posizione del fumetto.
 * Logica pura; il componente in `components/tour/` misura gli elementi e disegna.
 */

/** Tour disponibili. "intro" è quello iniziale; i tour di sezione si aggiungono qui. */
export type TourId = "intro";

export type TourStep = {
  /** Valore di `data-tour` degli elementi da evidenziare; senza, il fumetto sta al centro. */
  target?: string;
  title: string;
  body: string;
};

/**
 * Tour iniziale, mostrato su Oggi. I passi il cui elemento non è visibile si saltano:
 * così lo stesso elenco va bene su iPhone (barra in basso) e su desktop (barra laterale).
 * Testi neutri: nessun aggettivo riferito a chi usa l'app.
 */
export const INTRO_TOUR: TourStep[] = [
  {
    title: "Ti diamo il benvenuto",
    body: "In un minuto ti mostriamo le cose principali del planner. Puoi saltare il tour quando vuoi e rivederlo dalle Impostazioni.",
  },
  {
    target: "add",
    title: "Aggiungi qualsiasi cosa",
    body: "Scrivi come parli: «dentista giovedì alle 10», «bolletta della luce entro il weekend». Giorno, ora e area li riconosce da solo.",
  },
  {
    target: "day",
    title: "Muoviti tra i giorni",
    body: "Con le frecce passi al giorno prima o a quello dopo. Sul telefono puoi anche scorrere col dito.",
  },
  {
    target: "load",
    title: "Quanto è piena la giornata",
    body: "La barra mostra il tempo pianificato: in grigio quello già passato, in viola quello che resta.",
  },
  {
    target: "quick-add",
    title: "Aggiunta al volo",
    body: "Scrivi qui e premi Invio per mettere un'attività in questo giorno, una dopo l'altra. I dettagli si aggiungono toccando la riga.",
  },
  {
    target: "calendar",
    title: "Calendario",
    body: "Settimana e mese, con il colore di ogni area. Ci trovi anche gli eventi di Google Calendar e iCloud.",
  },
  {
    target: "lists",
    title: "Liste",
    body: "Spesa, pasti della settimana, wishlist e guardaroba, tutti in un posto.",
  },
  {
    target: "log",
    title: "Log",
    body: "Segna quando fai le cose che si ripetono, come parrucchiere o unghie, e vedi subito quanto tempo è passato dall'ultima volta.",
  },
  {
    target: "search",
    title: "Cerca",
    body: "Trova attività, eventi e articoli delle liste da qualsiasi schermata.",
  },
  {
    target: "settings",
    title: "Impostazioni",
    body: "Tema, notifiche e calendari collegati. Qui trovi anche questa guida, per rivederla quando vuoi.",
  },
  {
    title: "Tutto pronto",
    body: "Puoi iniziare: aggiungi la prima cosa della giornata.",
  },
];

export const TOURS: Record<TourId, TourStep[]> = { intro: INTRO_TOUR };

export function hasSeen(seen: readonly string[] | null | undefined, id: TourId): boolean {
  return !!seen?.includes(id);
}

/** L'elenco dei tour visti con `id` in più, senza doppioni e in ordine stabile. */
export function withSeen(seen: readonly string[] | null | undefined, id: TourId): string[] {
  return [...new Set([...(seen ?? []), id])].sort();
}

/** Tiene i passi senza elemento e quelli il cui elemento è visibile adesso. */
export function visibleSteps(steps: readonly TourStep[], isVisible: (target: string) => boolean): TourStep[] {
  return steps.filter((s) => !s.target || isVisible(s.target));
}

export type Rect = { left: number; top: number; width: number; height: number };

/** Il rettangolo che contiene tutti quelli dati (es. le quattro liste nella barra laterale). */
export function unionRect(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  return { left, top, width: right - left, height: bottom - top };
}

/** Il rettangolo allargato di `pad` per lato: il riflettore lascia un po' d'aria attorno all'elemento. */
export function padRect(r: Rect, pad: number): Rect {
  return { left: r.left - pad, top: r.top - pad, width: r.width + 2 * pad, height: r.height + 2 * pad };
}

export type CardPlacement = { left: number; top: number; width: number };

/**
 * Dove mettere il fumetto: a destra di un elemento della barra laterale (desktop),
 * altrimenti sotto o sopra l'elemento, dove c'è più spazio; al centro se non c'è elemento.
 * Resta sempre dentro lo schermo, con `margin` dai bordi.
 */
export function placeCard({
  target,
  viewport,
  card,
  gap = 14,
  margin = 16,
  maxWidth = 360,
}: {
  target: Rect | null;
  viewport: { width: number; height: number };
  card: { height: number };
  gap?: number;
  margin?: number;
  maxWidth?: number;
}): CardPlacement {
  const width = Math.min(maxWidth, viewport.width - 2 * margin);
  const clampX = (x: number) => Math.max(margin, Math.min(x, viewport.width - margin - width));
  const clampY = (y: number) => Math.max(margin, Math.min(y, viewport.height - margin - card.height));

  if (!target) {
    return { left: clampX((viewport.width - width) / 2), top: clampY((viewport.height - card.height) / 2), width };
  }

  const right = target.left + target.width;
  const roomRight = viewport.width - right - gap - margin;
  if (right < viewport.width * 0.4 && roomRight >= width) {
    return { left: right + gap, top: clampY(target.top + target.height / 2 - card.height / 2), width };
  }

  const bottom = target.top + target.height;
  const roomBelow = viewport.height - bottom - gap - margin;
  const roomAbove = target.top - gap - margin;
  const top = roomBelow >= card.height || roomBelow >= roomAbove ? bottom + gap : target.top - gap - card.height;
  return { left: clampX(target.left + target.width / 2 - width / 2), top: clampY(top), width };
}
