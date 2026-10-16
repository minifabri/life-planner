/**
 * Tour guidato (D65): passi, stato "già visto" e posizione del fumetto.
 * Logica pura; il componente in `components/tour/` misura gli elementi e disegna.
 */

/** Tour disponibili: "intro" è quello iniziale, gli altri sono i brevi tour di sezione. */
export type TourId = "intro" | "calendar" | "shopping" | "meals" | "wishlist" | "wardrobe" | "log";

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

/*
 * Tour di sezione: 2–4 passi, la prima volta che si apre la sezione.
 * Alcuni passi esistono in due versioni (desktop e iPhone) con elementi diversi:
 * si vede solo quella il cui elemento è sullo schermo.
 */

export const CALENDAR_TOUR: TourStep[] = [
  {
    target: "calendar-views",
    title: "Giorno, settimana, mese",
    body: "Passa da una vista all'altra. Il giorno è la schermata Oggi.",
  },
  {
    target: "calendar-grid",
    title: "Sposta trascinando",
    body: "Trascina un'attività, un allenamento o un evento su un altro giorno per spostarlo. Con un doppio clic su un giorno ne crei uno nuovo lì.",
  },
  {
    target: "calendar-days",
    title: "Apri un giorno",
    body: "Tocca un giorno per vederlo per intero. Con il + accanto aggiungi qualcosa direttamente in quel giorno.",
  },
  {
    target: "calendar-legend",
    title: "Cosa vogliono dire i segni",
    body: "Gli eventi hanno il colore della loro area, le attività con orario il bordo tratteggiato e gli allenamenti l'arancio. Il rombo oro segna scadenze e cose importanti.",
  },
  {
    target: "calendar-days",
    title: "Cosa vogliono dire i segni",
    body: "Il punto colorato è l'area di un evento, l'arancio è un allenamento, il rombo oro una scadenza o una cosa importante. La barra mostra quanto è piena la giornata.",
  },
];

export const SHOPPING_TOUR: TourStep[] = [
  {
    target: "shopping-add",
    title: "Scrivi come parli",
    body: "«2 latte d'avena», «500 g farina»: quantità e reparto li riconosce da solo. Mentre scrivi ti suggerisce le cose già comprate.",
  },
  {
    target: "shopping-frequent",
    title: "Compri spesso",
    body: "Le cose che prendi più spesso: un tocco e tornano in lista.",
  },
  {
    target: "shopping-list",
    title: "Spunta in negozio",
    body: "Tocca il quadratino per mettere un articolo nel carrello. Con i tre puntini lo modifichi.",
  },
];

export const MEALS_TOUR: TourStep[] = [
  {
    target: "meals-views",
    title: "Giorno, Settimana, Idee",
    body: "Nel giorno scrivi cosa mangi a colazione, pranzo e cena; tocca un momento per riempirlo.",
  },
  {
    target: "meals-week",
    title: "L'equilibrio della settimana",
    body: "La settimana mostra tutti i pasti e come si distribuiscono proteine, carboidrati, grassi e fibre.",
  },
  {
    target: "meals-ideas",
    title: "Idee per i momenti vuoti",
    body: "Proposte per i pasti ancora da decidere, a partire dai piatti abituali e da ciò che c'è in casa, come ceci, tofu o verdure di stagione.",
  },
  {
    target: "meals-pantry",
    title: "In casa",
    body: "Gli ingredienti comprati con la Spesa e non ancora finiti, con i pasti in programma che li usano. «Finito» li toglie dall'elenco.",
  },
];

export const WISHLIST_TOUR: TourStep[] = [
  {
    target: "wishlist-add",
    title: "Aggiungi un desiderio",
    body: "Incolla un link o scrivi il nome; prezzo, marca e categoria sono facoltativi.",
  },
  {
    target: "wishlist-import",
    title: "Importa da ChatGPT",
    body: "Aggiungi alla tua richiesta a ChatGPT la frase che ti diamo, poi incolla qui la risposta: controlli gli articoli riconosciuti prima di salvarli.",
  },
  {
    target: "wishlist-filters",
    title: "Stato e categorie",
    body: "Separa ciò che desideri da ciò che hai comprato o scartato, e filtra per categoria.",
  },
];

export const WARDROBE_TOUR: TourStep[] = [
  {
    target: "wardrobe-week",
    title: "La settimana",
    body: "Ufficio, viaggio e allenamenti dei prossimi giorni, per scegliere cosa mettere. Tocca un giorno per segnarlo.",
  },
  {
    target: "wardrobe-pieces",
    title: "Capi e outfit",
    body: "Aggiungi i capi con una foto, poi componi gli outfit da indossare o da pianificare.",
  },
  {
    target: "wardrobe-ideas",
    title: "Idee col meteo",
    body: "Outfit proposti in base alle previsioni della tua città. Senza città impostata si segue la stagione.",
  },
  {
    target: "wardrobe-stats",
    title: "Numeri",
    body: "Cosa metti di più e cosa resta nell'armadio da tempo.",
  },
];

export const LOG_TOUR: TourStep[] = [
  {
    target: "log-views",
    title: "Cronologia e categorie",
    body: "Nella cronologia trovi tutto ciò che hai segnato; nelle categorie le organizzi, con un colore e le parole che le riconoscono.",
  },
  {
    target: "log-last",
    title: "Ultima volta",
    body: "Per ogni categoria vedi quanto tempo è passato dall'ultima volta. Un tocco apre le registrazioni.",
  },
  {
    target: "log-lock",
    title: "Il blocco del Log",
    body: "Le categorie sensibili restano nascoste finché non sblocchi con il PIN, o con Face ID su questo dispositivo. Il blocco protegge ciò che si vede sullo schermo, non cifra i dati.",
  },
];

export const TOURS: Record<TourId, TourStep[]> = {
  intro: INTRO_TOUR,
  calendar: CALENDAR_TOUR,
  shopping: SHOPPING_TOUR,
  meals: MEALS_TOUR,
  wishlist: WISHLIST_TOUR,
  wardrobe: WARDROBE_TOUR,
  log: LOG_TOUR,
};

/** Nome del tour in Impostazioni › Guida, nell'ordine in cui compaiono. */
export const TOUR_LABEL: Record<TourId, string> = {
  intro: "Tour iniziale",
  calendar: "Calendario",
  shopping: "Spesa",
  meals: "Pasti",
  wishlist: "Wishlist",
  wardrobe: "Guardaroba",
  log: "Log",
};

/**
 * Il tour da far partire da solo su `pathname`, se c'è. Prima di tutto quello iniziale, che gira
 * solo sulla sua pagina; finché non è stato visto o saltato i tour di sezione aspettano,
 * così i due non si sovrappongono mai. Poi il tour della sezione aperta, se non è ancora stato visto.
 */
export function autoTour(
  seen: readonly string[] | null | undefined,
  pathname: string,
  pages: Record<TourId, string>,
): TourId | null {
  if (!hasSeen(seen, "intro")) return pathname === pages.intro ? "intro" : null;
  const id = (Object.keys(pages) as TourId[]).find((t) => pages[t] === pathname);
  return id && !hasSeen(seen, id) ? id : null;
}

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
