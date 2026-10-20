import type { LocalDate } from "../dates/local";
import type { EventKind, EventRow } from "../supabase/types";
import type { Occurrence } from "./day";

/** I tipi che si riconoscono dal titolo di un evento (D57, D72). Il compleanno si sceglie nell'app. */
export type TitleKind = Exclude<EventKind, "event" | "birthday">;

/**
 * Emoji a inizio titolo, come le scrive la schedulazione di Bibi su Google Calendar.
 * Si confronta l'inizio del titolo, quindi valgono anche le varianti (💇‍♀️, ✈️ con il selettore di variante).
 */
const EMOJI: Record<TitleKind, string[]> = {
  shipment: ["📦"],
  travel: ["✈", "🛫", "🛬", "🚆", "🚄", "🚅", "🚂", "🚃", "🚈", "🚌", "🚍", "⛴", "🚢", "🛳", "🧳", "🚗", "🚘"],
  stay: ["🏨", "🛏", "🏡", "🏩"],
  ticket: ["🎟", "🎫", "🎭", "🎬", "🎵", "🎶", "🎤", "🎸", "🎻", "🖼", "🏛", "🎪", "🏟"],
  reservation: ["🍽", "🍴", "🥂", "🍷", "🛎"],
  appointment: ["🩺", "💇", "💅", "🦷", "🏥", "💆", "💈", "👩‍⚕", "👨‍⚕", "🧑‍⚕", "🧖"],
  deadline: ["⏰", "⏳", "⌛", "💳", "🧾", "💶", "💸", "💰"],
};

/** Il tipo dato dall'emoji a inizio titolo, se è una di quelle riconosciute. */
function emojiKind(title: string): TitleKind | null {
  const start = title.trimStart();
  for (const kind of Object.keys(EMOJI) as TitleKind[]) {
    if (EMOJI[kind].some((e) => start.startsWith(e))) return kind;
  }
  return null;
}

/** Le emoji all'inizio del titolo (con varianti, toni della pelle e sequenze unite), e lo spazio che le segue. */
const LEADING_EMOJI = /^\s*[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{FE0F}\u{200D}]+\s*/u;

/** Parole intere (o radici, con `\p{L}*`): né lettere né cifre subito prima e subito dopo. */
function words(list: string[]): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.join("|")})(?![\\p{L}\\p{N}])`, "u");
}

/** Minuscolo e senza accenti, così "Caffè" e "caffe" si confrontano allo stesso modo. */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const TRAIN = ["tren[oi]", "train", "frecciarossa", "frecciargento", "frecciabianca", "italo", "trenitalia", "intercity", "eurostar", "tgv", "railjet"];
const BUS = ["autobus", "bus", "pullman", "flixbus", "itabus", "navetta", "shuttle"];
const SHIP = ["traghett[oi]", "ferry", "nave", "aliscafo", "catamarano", "crociera", "cruise", "moby", "tirrenia", "grimaldi"];
const CAR = ["noleggio auto", "autonoleggio", "car rental", "rent a car", "hertz", "avis", "europcar", "sixt"];
const PLANE = [
  "vol[oi]",
  "flight",
  "aere[oi]",
  "aeroporto",
  "airport",
  "imbarco",
  "boarding",
  "ryanair",
  "easyjet",
  "wizz ?air",
  "vueling",
  "volotea",
  "lufthansa",
  "ita airways",
  "british airways",
  "air france",
  "klm",
  "aeroitalia",
  "emirates",
  "iberia",
];

/**
 * Regole in ordine: vince la prima che trova qualcosa nel titolo.
 * Le parole forti di una scadenza vengono prima di tutto ("Scadenza biglietto del treno" è una scadenza);
 * quelle deboli ("pagamento", "prenotazione") solo dopo, quando nient'altro ha riconosciuto l'evento.
 */
const RULES: [TitleKind, RegExp][] = [
  ["deadline", words(["scadenza", "scadenze", "scade", "scadono", "rinnov[oa]", "rinnovare", "renewal", "deadline"])],
  ["travel", words([...PLANE, ...TRAIN, ...BUS, ...SHIP, ...CAR, "partenza per"])],
  [
    "stay",
    words([
      "hotel",
      "albergo",
      "airbnb",
      "b&b",
      "bed and breakfast",
      "ostello",
      "hostel",
      "resort",
      "agriturismo",
      "casa vacanze",
      "booking\\.com",
      "check[- ]?in",
      "check[- ]?out",
      "soggiorno",
      "pernottamento",
      "dormitorio",
      "stay at",
    ]),
  ],
  [
    "ticket",
    words([
      "concert[oi]",
      "concert",
      "cinema",
      "film",
      "teatro",
      "theat(?:re|er)",
      "muse[oi]",
      "museum",
      "mostra",
      "exhibition",
      "spettacolo",
      "bigliett[oi]",
      "tickets?",
      "festival",
      "opera",
      "balletto",
      "musical",
      "stadio",
      "ticketone",
    ]),
  ],
  [
    "appointment",
    words([
      "medic[oa]",
      "dottor\\p{L}*",
      "dott",
      "dr",
      "doctor",
      "dentist[ai]?",
      "ortodontist\\p{L}*",
      "visita (?:medica|specialistica|di controllo)",
      "visit[ae] \\p{L}+(?:ic[ahe]|al[ei])",
      "visite mediche",
      "estetista",
      "centro estetico",
      "parrucchier\\p{L}*",
      "barbiere",
      "hairstylist",
      "taglio",
      "piega",
      "manicure",
      "pedicure",
      "ceretta",
      "epilazione",
      "laser",
      "massaggi[oi]",
      "fisioterap\\p{L}*",
      "osteopat\\p{L}*",
      "oculist\\p{L}*",
      "ginecolog\\p{L}*",
      "\\p{L}+olog[oa]",
      "\\p{L}+iatra",
      "dermatolog\\p{L}*",
      "cardiolog\\p{L}*",
      "nutrizionist\\p{L}*",
      "psicolog\\p{L}*",
      "psicoterap\\p{L}*",
      "terapia",
      "analisi del sangue",
      "esami del sangue",
      "prelievo",
      "ecografia",
      "radiografia",
      "vaccino",
      "check-?up",
      "consulenza",
      "consulente",
      "appuntamento",
      "appointment",
      "commercialista",
      "avvocat[oa]",
      "notaio",
      "veterinari[oa]",
    ]),
  ],
  [
    "reservation",
    words([
      "ristorante",
      "restaurant",
      "trattoria",
      "osteria",
      "pizzeria",
      "bistrot",
      "tavolo",
      "thefork",
      "the fork",
      "reservation",
      "esperienza",
      "experience",
      "tour",
      "escursione",
      "degustazione",
      "tasting",
      "spa",
      "visita guidata",
    ]),
  ],
  ["deadline", words(["pagamento", "pagare", "bollett[ae]", "rata", "assicurazione", "bollo", "tass[ae]", "f24", "imu", "tari", "canone", "abbonamento", "subscription", "revisione auto"])],
  ["reservation", words(["prenotazione", "prenotat[oa]", "booking"])],
];

/** Verbi di chi deve fare qualcosa: il titolo parla di un'attività, non dell'evento. */
const TODO = words([
  "preparare",
  "controllare",
  "ricontrollare",
  "verificare",
  "prenotare",
  "cercare",
  "organizzare",
  "confermare",
  "stampare",
  "scaricare",
  "chiamare",
  "comprare",
  "disdire",
  "annullare",
  "ricordare",
]);

/** Una tratta scritta con la freccia ("Roma → Milano") o, se non c'è, con il trattino tra due spazi ("Roma - Milano"). */
const ARROW = /\s*(?:→|->|➝|➔|⟶|⇒)\s*/u;
const DASH = /\s+[-–—]\s+/u;

/**
 * Tipo di un evento dal titolo: prima l'emoji a inizio titolo, poi le parole.
 * Vale per gli eventi letti da un calendario esterno o da un file e per quelli scritti nell'app.
 */
export function kindFromTitle(title: string): EventKind {
  const byEmoji = emojiKind(title);
  if (byEmoji) return byEmoji;
  const text = normalize(title.replace(LEADING_EMOJI, ""));
  const [strong, ...rest] = RULES;
  if (strong[1].test(text)) return strong[0];
  // "Preparare il check-in", "Controllare i voli": è qualcosa da fare intorno al viaggio, non il viaggio.
  if (TODO.test(text)) return "event";
  for (const [kind, re] of rest) if (re.test(text)) return kind;
  // Una tratta con la freccia senza altre parole ("CA939 · Pechino → Roma") è un viaggio.
  if (ARROW.test(text)) return "travel";
  return "event";
}

/** Il titolo da mostrare: senza l'emoji che ha dato il tipo, perché la sostituisce l'icona. */
export function displayTitle(event: Pick<EventRow, "title" | "kind">): string {
  if (event.kind === "event" || event.kind === "birthday" || emojiKind(event.title) !== event.kind) return event.title;
  return event.title.replace(LEADING_EMOJI, "").trim() || event.title;
}

export type TravelMode = "plane" | "train" | "bus" | "ship" | "car";

const MODE_RULES: [TravelMode, RegExp, string[]][] = [
  ["train", words(TRAIN), ["🚆", "🚄", "🚅", "🚂", "🚃", "🚈"]],
  ["bus", words(BUS), ["🚌", "🚍"]],
  ["ship", words(SHIP), ["⛴", "🚢", "🛳"]],
  ["car", words(CAR), ["🚗", "🚘"]],
];

/** Con cosa si viaggia, per l'icona: aereo se il titolo non dice altro. */
export function travelMode(title: string): TravelMode {
  const start = title.trimStart();
  const text = normalize(title);
  for (const [mode, re, emoji] of MODE_RULES) if (emoji.some((e) => start.startsWith(e)) || re.test(text)) return mode;
  return "plane";
}

/** Parole che non dicono il luogo di una tratta. */
const ROUTE_NOISE = words([...PLANE, ...TRAIN, ...BUS, ...SHIP, "da", "a", "per", "from", "to", "andata", "ritorno", "partenza", "arrivo"]);

/** Le parole che nominano un luogo: almeno tre lettere, senza cifre (niente codici del volo o del treno). */
function placeWords(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !/\d/.test(w) && !ROUTE_NOISE.test(w));
}

/**
 * Da dove e per dove, se il titolo lo dice: "Roma → Milano", "Treno Roma - Milano",
 * "Volo da Roma a Milano", "Flight from Rome to London". Null se non si capisce.
 */
export function travelRoute(title: string): { from: string[]; to: string[] } | null {
  const text = title.replace(LEADING_EMOJI, "");
  const daA = /(?:^|\s)(?:da|from)\s+(.+?)\s+(?:a|ad|per|to)\s+(.+)$/iu.exec(text);
  const parts = daA ? [daA[1], daA[2]] : text.split(ARROW.test(text) ? ARROW : DASH);
  if (parts.length !== 2) return null;
  const from = placeWords(parts[0]);
  const to = placeWords(parts[1]);
  return from.length && to.length ? { from, to } : null;
}

/** Due luoghi di una tratta sono lo stesso se hanno una parola in comune ("Roma Fiumicino (FCO)" e "Roma Termini"). */
export function samePlace(a: string[], b: string[]): boolean {
  return a.some((w) => b.includes(w));
}

/** Spedizioni e compleanni non occupano la giornata: si mostrano a parte, in piccolo. */
export function isQuiet(kind: EventKind | undefined): boolean {
  return kind === "shipment" || kind === "birthday";
}

/** Separa le occorrenze discrete da quelle dell'agenda. */
export function splitQuiet(occurrences: Occurrence[]): { regular: Occurrence[]; quiet: Occurrence[] } {
  const regular: Occurrence[] = [];
  const quiet: Occurrence[] = [];
  for (const o of occurrences) (isQuiet(o.event.kind) ? quiet : regular).push(o);
  // Prima i compleanni, poi le spedizioni, ciascuno in ordine di titolo.
  quiet.sort((a, b) => Number(a.event.kind === "shipment") - Number(b.event.kind === "shipment") || displayTitle(a.event).localeCompare(displayTitle(b.event), "it"));
  return { regular, quiet };
}

/**
 * Ripetizione di un compleanno: ogni anno, nello stesso giorno.
 * Chi è nato il 29 febbraio lo festeggia l'ultimo giorno di febbraio, anche negli anni non bisestili.
 */
export function birthdayRule(date: LocalDate): string {
  return date.slice(5) === "02-29" ? "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1" : "FREQ=YEARLY";
}

export const KIND_LABEL: Record<EventKind, string> = {
  event: "Evento",
  shipment: "Spedizione",
  birthday: "Compleanno",
  appointment: "Appuntamento",
  travel: "Viaggio",
  stay: "Soggiorno",
  ticket: "Biglietto",
  reservation: "Prenotazione",
  deadline: "Scadenza",
};
