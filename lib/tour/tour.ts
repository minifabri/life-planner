/**
 * Tour guidato (D66): passi, stato "già visto" e posizione del fumetto.
 * Logica pura; il componente in `components/tour/` misura gli elementi e disegna.
 */

/** Tour disponibili: "intro" è quello iniziale, gli altri sono i brevi tour di sezione. */
export type TourId = "intro" | "calendar" | "shopping" | "meals" | "wishlist" | "wardrobe" | "medicines" | "log";

export type TourStep = {
  /** Valore di `data-tour` degli elementi da evidenziare; senza, il fumetto sta al centro. */
  target?: string;
  title: string;
  body: string;
};

/**
 * Tour iniziale, mostrato su Oggi. Non spiega l'ovvio (che Settimana mostra la settimana):
 * per ogni parte racconta un trucco che non salta all'occhio.
 * I passi il cui elemento non è visibile si saltano: così lo stesso elenco va bene su iPhone
 * (barra in basso) e su desktop (barra laterale).
 * Testi neutri: nessun aggettivo riferito a chi usa l'app. Esempi di cibo solo vegani.
 */
export const INTRO_TOUR: TourStep[] = [
  {
    title: "Ti diamo il benvenuto",
    body: "Ecco qualche trucco che a prima vista non si nota. Chiudi con la X quando vuoi: la guida si rivede dalle Impostazioni.",
  },
  {
    target: "add",
    title: "Una frase, e fa tutto da sé",
    body: "«Yoga ogni lunedì alle 18» si ripete. «Ricordami di chiamare Sara domani» ti manda una notifica. «Compleanno di Marta 12 ottobre» torna ogni anno. Con un link, l'articolo va dritto in Wishlist.",
  },
  {
    target: "add",
    title: "Scorciatoie",
    body: "Con «spesa: ceci» l'articolo va dritto nella lista della Spesa, con «log: parrucchiere» nel Log. Sul computer, il tasto N apre l'aggiunta da qualsiasi schermata.",
  },
  {
    target: "day",
    title: "Cambia giorno col dito",
    body: "Sul telefono scorri a destra o a sinistra sulla pagina; sul computer usa le frecce della tastiera.",
  },
  {
    target: "quick-add",
    title: "Una dopo l'altra",
    body: "Scrivi e premi Invio: l'attività resta in questo giorno e il campo è subito pronto per la prossima.",
  },
  {
    target: "calendar",
    title: "Calendario",
    body: "Sul computer sposti le cose trascinandole da un giorno all'altro. Gli eventi che iniziano con 📦 diventano spedizioni: piccole, e senza pesare sulla giornata.",
  },
  {
    target: "lists",
    title: "Le liste si parlano",
    body: "Un articolo urgente della Spesa diventa un'attività in Oggi. Ciò che compri finisce «In casa», e le idee per i pasti partono da lì.",
  },
  {
    target: "log",
    title: "Log",
    body: "Insegna al Log le tue parole: dopo, «unghie oggi» scritto nell'aggiunta diventa una registrazione, e vedi quanto tempo è passato dall'ultima volta.",
  },
  {
    target: "search",
    title: "Cerca",
    body: "Trova attività, eventi e articoli delle liste. Sul computer si apre da ovunque con ⌘K o Ctrl+K.",
  },
  {
    target: "settings",
    title: "Impostazioni",
    body: "Collega Google Calendar e iCloud, scegli la città per il meteo del Guardaroba e crea dei template: gruppi di attività che nascono tutti insieme.",
  },
  {
    title: "Ogni sezione ha i suoi trucchi",
    body: "La prima volta che apri Calendario, Spesa, Pasti, Acquisti, Guardaroba o Log, un mini tour ti mostra quelli di quella sezione.",
  },
];

/*
 * Tour di sezione: 2–4 passi, la prima volta che si apre la sezione, ognuno con una funzione
 * poco visibile. Alcuni passi esistono in due versioni (desktop e iPhone) con elementi diversi:
 * si vede solo quella il cui elemento è sullo schermo.
 */

export const CALENDAR_TOUR: TourStep[] = [
  {
    target: "calendar-grid",
    title: "Sposta trascinando",
    body: "Trascina un'attività su un altro giorno: hai qualche secondo per annullare. Allo stesso modo si spostano allenamenti ed eventi creati qui. Con un doppio clic su un giorno crei qualcosa lì.",
  },
  {
    target: "calendar-period",
    title: "Fissa le cose «entro»",
    body: "Le attività come «entro venerdì» stanno nella fascia Periodo. Trascinane una su un giorno e diventa un impegno di quel giorno.",
  },
  {
    target: "calendar-days",
    title: "Aggiungi senza passare da Oggi",
    body: "Il + accanto a ogni giorno crea l'attività o l'evento direttamente lì. Tocca il giorno per vederlo per intero.",
  },
  {
    target: "calendar-legend",
    title: "I segni discreti",
    body: "Il rombo oro segna scadenze e cose importanti. Le piccole icone grigie sono ufficio, viaggio, spedizioni 📦 e compleanni: si vedono, ma non riempiono la giornata.",
  },
  {
    target: "calendar-days",
    title: "I segni discreti",
    body: "Il rombo oro segna scadenze e cose importanti. Le piccole icone grigie sono ufficio, viaggio, spedizioni 📦 e compleanni: si vedono, ma non riempiono la giornata.",
  },
];

export const SHOPPING_TOUR: TourStep[] = [
  {
    target: "shopping-add",
    title: "Il reparto lo impara",
    body: "Scrivi «2 latte d'avena» o «500 g farina»: quantità e reparto li trova da solo. Se correggi un reparto, la prossima volta se lo ricorda.",
  },
  {
    target: "shopping-list",
    title: "Urgente? Finisce in Oggi",
    body: "Dai tre puntini segna un articolo come urgente: in Oggi compare «Comprare …», da fare entro due giorni. Quando lo spunti qui, si completa anche lì.",
  },
  {
    target: "shopping-list",
    title: "Dalla Spesa ai Pasti",
    body: "Quello che spunti finisce «In casa» nei Pasti, e le idee per i pasti lo usano per prime.",
  },
  {
    target: "shopping-seasonal",
    title: "Di stagione",
    body: "In fondo trovi frutta e verdura di questo mese, prima quelle che compri già: un tocco e sono in lista.",
  },
];

export const MEALS_TOUR: TourStep[] = [
  {
    target: "meals-slots",
    title: "Da preparare",
    body: "Segna un pasto come «Da preparare»: il giorno prima, in Oggi, compare «Preparare il pranzo di domani». Se mangi fuori, basta segnarlo: il piatto è facoltativo.",
  },
  {
    target: "meals-ideas",
    title: "Idee vegane per i buchi",
    body: "Proposte per i pasti ancora vuoti, dai tuoi piatti abituali, da ciò che c'è in casa e da ciò che è di stagione. «Meno» ne nasconde una per tre settimane.",
  },
  {
    target: "meals-week",
    title: "Quanto è varia la settimana",
    body: "Proteine, carboidrati, grassi e fibre di tutta la settimana, riconosciuti dal nome del piatto. Nel Giorno, la riga dei micronutrienti mostra ferro, calcio, omega-3 e altri.",
  },
  {
    target: "meals-pantry",
    title: "In casa",
    body: "Gli ingredienti comprati e i pasti che li usano. «Finito» li toglie da qui e li rimette nella lista della Spesa.",
  },
];

export const WISHLIST_TOUR: TourStep[] = [
  {
    target: "wishlist-add",
    title: "Basta un link",
    body: "Incolla il link di un prodotto: nome, immagine e prezzo li prova a recuperare da solo. Quelli che non trova restano vuoti, mai inventati.",
  },
  {
    target: "wishlist-import",
    title: "Importa da ChatGPT",
    body: "Aggiungi alla tua richiesta a ChatGPT la frase che ti diamo, poi incolla qui la risposta: controlli gli articoli riconosciuti prima di salvarli.",
  },
  {
    target: "wishlist-filters",
    title: "Dalla Wishlist all'armadio",
    body: "Segna un articolo come capo e ti dice cosa hai già di simile nel Guardaroba. Quando lo compri, entra nel Guardaroba senza riscrivere nulla.",
  },
];

export const WARDROBE_TOUR: TourStep[] = [
  {
    target: "wardrobe-pieces",
    title: "Una foto basta",
    body: "Fotografa un capo: colori, tipo e nome li propone l'app, tutto sul telefono e sempre correggibile. «Indossato oggi» chiede capo per capo cosa va lavato.",
  },
  {
    target: "wardrobe-week",
    title: "Ufficio o viaggio",
    body: "Tocca un giorno per segnarlo «in ufficio» o «in viaggio»: il segno compare anche in Oggi, nei Pasti e nel Calendario.",
  },
  {
    target: "wardrobe-ideas",
    title: "Idee col meteo",
    body: "Outfit proposti in base alle previsioni della tua città. «Pianifica» ne fissa uno per un giorno, e lo ritrovi in Oggi.",
  },
  {
    target: "wardrobe-stats",
    title: "Cosa resta nell'armadio",
    body: "I capi mai indossati, quelli fermi da più di due mesi e quelli mai abbinati in un outfit.",
  },
];

export const MEDICINES_TOUR: TourStep[] = [
  {
    target: "medicines-add",
    title: "Ritmi diversi",
    body: "Oltre a tutti i giorni, una medicina può andare solo in certi giorni della settimana o a cicli: una settimana sì e una no, due sì e due no.",
  },
  {
    target: "medicines-today",
    title: "Te lo chiede Oggi",
    body: "All'orario della mattina e della sera, Oggi chiede cosa hai preso. «Ricordamelo» la ripropone fra un'ora, tre ore o al prossimo momento; senza risposta, il giorno dopo chiede di ieri.",
  },
  {
    target: "medicines-list",
    title: "Quando sta finendo",
    body: "Nella scheda, «Sta finendo» la mette nella lista della Spesa. Sotto c'è lo storico giorno per giorno.",
  },
];

export const LOG_TOUR: TourStep[] = [
  {
    target: "log-views",
    title: "Insegna le tue parole",
    body: "In Categorie, dai a ognuna le parole che la riconoscono. Poi «unghie oggi» scritto nell'aggiunta diventa una registrazione, senza aprire il Log.",
  },
  {
    target: "log-last",
    title: "Ultima volta",
    body: "Per ogni categoria vedi quanto tempo è passato dall'ultima volta. Un tocco apre le registrazioni.",
  },
  {
    target: "log-lock",
    title: "Categorie riservate",
    body: "Le categorie sensibili restano nascoste finché non sblocchi con il PIN, o con Face ID su questo dispositivo. Nelle notifiche compaiono con un titolo neutro.",
  },
];

export const TOURS: Record<TourId, TourStep[]> = {
  intro: INTRO_TOUR,
  calendar: CALENDAR_TOUR,
  shopping: SHOPPING_TOUR,
  meals: MEALS_TOUR,
  wishlist: WISHLIST_TOUR,
  wardrobe: WARDROBE_TOUR,
  medicines: MEDICINES_TOUR,
  log: LOG_TOUR,
};

/** Nome del tour in Impostazioni › Guida, nell'ordine in cui compaiono. */
export const TOUR_LABEL: Record<TourId, string> = {
  intro: "Tour iniziale",
  calendar: "Calendario",
  shopping: "Spesa",
  meals: "Pasti",
  wishlist: "Acquisti",
  wardrobe: "Guardaroba",
  medicines: "Medicine",
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
