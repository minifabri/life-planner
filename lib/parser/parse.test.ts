import { describe, expect, it } from "vitest";
import { parseCapture, type CategoryHint, type ParsedCapture } from "./parse";

// Sabato 10 ottobre 2026, ore 10:00.
const TODAY = "2026-10-10";
const NOW = "10:00";

/** Categorie predefinite del Log, come le crea `handle_new_user`. */
const CATEGORIES: CategoryHint[] = [
  { id: "ciclo", name: "Ciclo", keywords: ["ciclo"], is_sensitive: true },
  { id: "trattamenti", name: "Trattamenti", keywords: ["trattamento", "farmaco", "terapia"], is_sensitive: true },
  { id: "unghie", name: "Unghie", keywords: ["unghie", "semipermanente"], is_sensitive: false },
  { id: "parrucchiere", name: "Parrucchiere", keywords: ["parrucchiere", "capelli", "taglio"], is_sensitive: false },
  { id: "estetica", name: "Estetica", keywords: ["estetista", "ceretta"], is_sensitive: false },
  { id: "personale", name: "Personale", keywords: [], is_sensitive: false },
];

function parse(text: string, extra: Partial<Parameters<typeof parseCapture>[1]> = {}) {
  return parseCapture(text, { today: TODAY, now: NOW, categories: CATEGORIES, ...extra });
}

type Expected = Partial<Omit<ParsedCapture, "spans">>;

/**
 * La suite: frasi reali con il risultato atteso. Ogni errore trovato nell'uso diventa una riga in più.
 * I campi non indicati devono restare vuoti (nessuna data, ora, durata, finestra o ripetizione inventata).
 */
const SUITE: [string, Expected][] = [
  // Regole della Product Definition, 7.4
  ["Comprare tofu", { kind: "shopping", title: "tofu", confidence: "low" }],
  ["Domani mettere in ammollo i ceci", { kind: "task", title: "Mettere in ammollo i ceci", date: "2026-10-11" }],
  ["Dentista martedì alle 15", { kind: "event", title: "Dentista", date: "2026-10-13", time: "15:00" }],
  ["Prenotare unghie", { kind: "task", title: "Prenotare unghie", categoryId: "unghie" }],
  ["Comprare mascara", { kind: "shopping", title: "mascara", confidence: "low" }],
  ["Inizio ciclo oggi", { kind: "log", title: "Inizio ciclo", date: TODAY, categoryId: "ciclo", sensitive: true }],
  [
    "Tra tre mesi ricordami di controllare una scadenza",
    { kind: "task", title: "Controllare una scadenza", date: "2027-01-10", attention: "medium" },
  ],
  ["wish: siero vitamina C", { kind: "wishlist", title: "Siero vitamina C" }],
  [
    "https://www.sephora.it/p/siero-123.html",
    { kind: "wishlist", title: "sephora.it", url: "https://www.sephora.it/p/siero-123.html" },
  ],

  // User journey
  [
    "domani alle 20 mettere in ammollo le lenticchie",
    { kind: "task", title: "Mettere in ammollo le lenticchie", date: "2026-10-11", time: "20:00" },
  ],
  ["unghie semipermanente viola", { kind: "log", title: "Unghie semipermanente viola", date: TODAY, categoryId: "unghie", confidence: "low" }],
  ["pratica yoga alle 17 45 min", { kind: "event", title: "Pratica yoga", date: TODAY, time: "17:00", durationMin: 45 }],

  // Prefissi
  ["spesa: latte di avena", { kind: "shopping", title: "latte di avena" }],
  ["Spesa : Pane", { kind: "shopping", title: "Pane" }],
  ["wishlist: stivali neri", { kind: "wishlist", title: "Stivali neri" }],
  ["log: massaggio schiena", { kind: "log", title: "Massaggio schiena", date: TODAY }],
  ["log: ceretta ieri", { kind: "log", title: "Ceretta", date: "2026-10-09", categoryId: "estetica" }],
  ["log: taglio capelli lunedì", { kind: "log", title: "Taglio capelli", date: "2026-10-05", categoryId: "parrucchiere" }],
  ["log: visita 3/10", { kind: "log", title: "Visita", date: "2026-10-03" }],
  ["spesa: comprare il latte", { kind: "shopping", title: "latte" }],

  // Spesa e wishlist
  ["comprare il latte", { kind: "shopping", title: "latte", confidence: "low" }],
  ["Comprare dell'aglio", { kind: "shopping", title: "aglio", confidence: "low" }],
  ["compra uova", { kind: "shopping", title: "uova", confidence: "low" }],
  ["domani comprare il regalo per Marta", { kind: "task", title: "Comprare il regalo per Marta", date: "2026-10-11" }],
  [
    "borsa vista qui https://example.com/borsa?id=3.",
    { kind: "wishlist", title: "Borsa vista qui", url: "https://example.com/borsa?id=3" },
  ],

  // Date
  ["chiamare la mamma oggi", { kind: "task", title: "Chiamare la mamma", date: TODAY }],
  ["dopodomani portare la macchina dal meccanico", { kind: "task", title: "Portare la macchina dal meccanico", date: "2026-10-12" }],
  ["lunedì pagare l'affitto", { kind: "task", title: "Pagare l'affitto", date: "2026-10-12" }],
  ["pagare la bolletta sabato", { kind: "task", title: "Pagare la bolletta", date: "2026-10-17" }],
  ["giovedì prossimo chiamare il commercialista", { kind: "task", title: "Chiamare il commercialista", date: "2026-10-15" }],
  ["fra 10 giorni rinnovare l'abbonamento", { kind: "task", title: "Rinnovare l'abbonamento", date: "2026-10-20" }],
  ["tra una settimana annaffiare le piante", { kind: "task", title: "Annaffiare le piante", date: "2026-10-17" }],
  ["tra un mese controllare la caldaia", { kind: "task", title: "Controllare la caldaia", date: "2026-11-10" }],
  ["ritirare il pacco il 12/10", { kind: "task", title: "Ritirare il pacco", date: "2026-10-12" }],
  ["spedire i documenti il 3/10", { kind: "task", title: "Spedire i documenti", date: "2027-10-03" }],
  ["rinnovo passaporto 15/01/2027", { kind: "task", title: "Rinnovo passaporto", date: "2027-01-15", confidence: "low" }],
  ["compleanno Marta 12 ottobre", { kind: "event", title: "Marta", date: "2026-10-12", birthday: true }],
  ["Compleanno di Luca il 3/2", { kind: "event", title: "Luca", date: "2027-02-03", birthday: true }],
  ["compleanno della mamma 3 marzo", { kind: "event", title: "Mamma", date: "2027-03-03", birthday: true }],
  ["Giulia compleanno 7 marzo", { kind: "event", title: "Giulia", date: "2027-03-07", birthday: true }],
  ["compleanno Marta 12/10/1990", { kind: "event", title: "Marta", date: "1990-10-12", birthday: true }],
  ["compleanno Marta sabato alle 20", { kind: "event", title: "Compleanno Marta", date: "2026-10-17", time: "20:00" }],
  ["comprare regalo per il compleanno sabato", { kind: "task", title: "Comprare regalo per il compleanno", date: "2026-10-17" }],
  ["regalo per il compleanno sabato", { kind: "task", title: "Regalo per il compleanno", date: "2026-10-17", confidence: "low" }],
  ["compleanno Marta", { kind: "task", title: "Compleanno Marta" }],
  ["cena di Natale il 24 dicembre alle 20", { kind: "event", title: "Cena di Natale", date: "2026-12-24", time: "20:00" }],
  ["saggio di danza il 1° giugno alle 18", { kind: "event", title: "Saggio di danza", date: "2027-06-01", time: "18:00" }],
  ["commercialista il 20 alle 11", { kind: "event", title: "Commercialista", date: "2026-10-20", time: "11:00" }],
  ["bonifico il 5", { kind: "task", title: "Bonifico", date: "2026-11-05", confidence: "low" }],
  ["leggere il 2 di picche", { kind: "task", title: "Leggere il 2 di picche" }],
  ["yoga 31/02", { kind: "task", title: "Yoga 31/02" }],

  // Orari
  ["Riunione 9:30", { kind: "event", title: "Riunione", date: "2026-10-11", time: "09:30" }],
  ["riunione oggi 9:30", { kind: "event", title: "Riunione", date: TODAY, time: "09:30" }],
  ["call con Luca alle 15.30", { kind: "event", title: "Call con Luca", date: TODAY, time: "15:30" }],
  ["dentista martedì alle 3", { kind: "event", title: "Dentista", date: "2026-10-13", time: "15:00" }],
  ["sveglia domani alle 06:30", { kind: "event", title: "Sveglia", date: "2026-10-11", time: "06:30" }],
  ["cena con Marta venerdì sera alle 8", { kind: "event", title: "Cena con Marta", date: "2026-10-16", time: "20:00" }],
  ["aperitivo stasera alle 7", { kind: "event", title: "Aperitivo", date: TODAY, time: "19:00" }],
  ["colazione con Anna domani mattina alle 8 e mezza", { kind: "event", title: "Colazione con Anna", date: "2026-10-11", time: "08:30" }],
  ["pranzo dai miei domenica all'una", { kind: "event", title: "Pranzo dai miei", date: "2026-10-11", time: "13:00" }],
  ["pranzo a mezzogiorno", { kind: "event", title: "Pranzo", date: TODAY, time: "12:00" }],
  ["film alle 9 di sera", { kind: "event", title: "Film", date: TODAY, time: "21:00" }],
  ["stasera mettere in ammollo i ceci", { kind: "task", title: "Mettere in ammollo i ceci", date: TODAY }],
  ["stamattina chiamare l'idraulico", { kind: "task", title: "Chiamare l'idraulico", date: TODAY }],
  ["tra due ore stendere il bucato", { kind: "task", title: "Stendere il bucato", date: TODAY, time: "12:00" }],
  ["fra mezz'ora spegnere il forno", { kind: "task", title: "Spegnere il forno", date: TODAY, time: "10:30" }],
  ["lezione yoga 25:99", { kind: "task", title: "Lezione yoga 25:99" }],

  // Durate
  ["pratica yoga domani alle 17 per 45 minuti", { kind: "event", title: "Pratica yoga", date: "2026-10-11", time: "17:00", durationMin: 45 }],
  ["stirare un'ora", { kind: "task", title: "Stirare", durationMin: 60 }],
  ["studiare inglese domani 1h30", { kind: "task", title: "Studiare inglese", date: "2026-10-11", durationMin: 90 }],
  ["camminata oggi mezz'ora", { kind: "task", title: "Camminata", date: TODAY, durationMin: 30, confidence: "low" }],
  ["pulire casa sabato due ore e mezza", { kind: "task", title: "Pulire casa", date: "2026-10-17", durationMin: 150 }],
  ["lezione dalle 19 alle 20:15", { kind: "event", title: "Lezione", date: TODAY, time: "19:00", durationMin: 75 }],
  ["massaggio giovedì dalle 5 alle 6", { kind: "event", title: "Massaggio", date: "2026-10-15", time: "17:00", durationMin: 60 }],
  ["concerto stasera dalle 9 alle 11", { kind: "event", title: "Concerto", date: TODAY, time: "21:00", durationMin: 120 }],

  // Nel periodo
  ["pagare la bolletta entro domenica", { kind: "task", title: "Pagare la bolletta", windowEnd: "2026-10-11" }],
  ["dichiarazione dei redditi entro fine mese", { kind: "task", title: "Dichiarazione dei redditi", windowEnd: "2026-10-31" }],
  ["rinnovare la tessera entro il 20", { kind: "task", title: "Rinnovare la tessera", windowEnd: "2026-10-20" }],
  ["Entro venerdì mandare il preventivo", { kind: "task", title: "Mandare il preventivo", windowEnd: "2026-10-16" }],
  ["prenotare il volo entro il 15 novembre", { kind: "task", title: "Prenotare il volo", windowEnd: "2026-11-15" }],
  ["sistemare l'armadio entro 3 giorni", { kind: "task", title: "Sistemare l'armadio", windowEnd: "2026-10-13" }],
  ["riordinare la cantina entro fine settimana", { kind: "task", title: "Riordinare la cantina", windowEnd: "2026-10-11" }],
  ["parrucchiere entro fine mese", { kind: "task", title: "Parrucchiere", windowEnd: "2026-10-31", categoryId: "parrucchiere" }],

  // Evento o attività
  ["Parrucchiere giovedì alle 10", { kind: "event", title: "Parrucchiere", date: "2026-10-15", time: "10:00", categoryId: "parrucchiere" }],
  ["chiamarla domani alle 9", { kind: "task", title: "Chiamarla", date: "2026-10-11", time: "09:00" }],
  ["Carla domani alle 9", { kind: "event", title: "Carla", date: "2026-10-11", time: "09:00" }],
  ["corriere lunedì alle 11", { kind: "event", title: "Corriere", date: "2026-10-12", time: "11:00" }],
  ["palestra domani", { kind: "task", title: "Palestra", date: "2026-10-11", confidence: "low" }],
  ["ricordami di chiamare Luca domani alle 15", { kind: "task", title: "Chiamare Luca", date: "2026-10-11", time: "15:00", attention: "medium" }],
  ["ricordami che martedì c'è il mercato", { kind: "task", title: "C'è il mercato", date: "2026-10-13", attention: "medium" }],
  ["idea per il blog", { kind: "task", title: "Idea per il blog" }],

  // Ripetizioni
  ["yoga ogni lunedì alle 19", { kind: "event", title: "Yoga", date: "2026-10-12", time: "19:00", repeat: { freq: "weekly", interval: 1, byDay: [1] } }],
  ["lezione ogni martedì e giovedì alle 18:30", { kind: "event", title: "Lezione", date: "2026-10-13", time: "18:30", repeat: { freq: "weekly", interval: 1, byDay: [2, 4] } }],
  ["innaffiare le piante ogni sabato", { kind: "task", title: "Innaffiare le piante", date: TODAY, repeat: { freq: "weekly", interval: 1, byDay: [6] } }],
  ["prendere la vitamina D ogni giorno", { kind: "task", title: "Prendere la vitamina D", date: TODAY, repeat: { freq: "daily", interval: 1 } }],
  ["cambiare le lenzuola ogni 2 settimane", { kind: "task", title: "Cambiare le lenzuola", date: TODAY, repeat: { freq: "weekly", interval: 2 } }],

  // Log
  ["ciclo", { kind: "log", title: "Ciclo", date: TODAY, categoryId: "ciclo", sensitive: true, confidence: "low" }],
  ["fine ciclo ieri", { kind: "log", title: "Fine ciclo", date: "2026-10-09", categoryId: "ciclo", sensitive: true }],
  ["ceretta oggi alle 16", { kind: "log", title: "Ceretta", date: TODAY, time: "16:00", categoryId: "estetica" }],
  ["Terapia iniziata oggi", { kind: "log", title: "Terapia iniziata", date: TODAY, categoryId: "trattamenti", sensitive: true }],
  ["estetista venerdì alle 17", { kind: "event", title: "Estetista", date: "2026-10-16", time: "17:00", categoryId: "estetica" }],
  ["riciclo della carta domani", { kind: "task", title: "Riciclo della carta", date: "2026-10-11", confidence: "low" }],
];

const EMPTY: Omit<ParsedCapture, "spans" | "kind" | "title"> = {
  date: null,
  time: null,
  durationMin: null,
  windowEnd: null,
  repeat: null,
  attention: "low",
  categoryId: null,
  sensitive: false,
  url: null,
  birthday: false,
  confidence: "high",
};

describe("parser del Quick Capture", () => {
  it.each(SUITE)("%s", (text, expected) => {
    const { spans, ...result } = parse(text);
    expect(spans).toBeDefined();
    expect(result).toEqual({ ...EMPTY, ...expected });
  });
});

describe("tipo scelto a mano", () => {
  it("sposta un articolo dalla spesa alla wishlist senza cambiare il nome", () => {
    expect(parse("Comprare mascara", { kind: "wishlist" })).toMatchObject({ kind: "wishlist", title: "Mascara", confidence: "high" });
  });

  it("trasforma un articolo in attività tenendo il verbo", () => {
    expect(parse("Comprare mascara", { kind: "task" })).toMatchObject({ kind: "task", title: "Comprare mascara" });
  });

  it("vince sul prefisso e sulle regole", () => {
    expect(parse("Dentista martedì alle 15", { kind: "task" })).toMatchObject({ kind: "task", title: "Dentista", date: "2026-10-13", time: "15:00" });
    expect(parse("log: yoga", { kind: "task" })).toMatchObject({ kind: "task", title: "Yoga", date: null });
  });

  it("una registrazione forzata legge le date al passato", () => {
    expect(parse("Parrucchiere giovedì", { kind: "log" })).toMatchObject({ kind: "log", date: "2026-10-08", categoryId: "parrucchiere" });
  });
});

describe("ora corrente", () => {
  it("un orario di oggi già passato vale per domani", () => {
    expect(parse("chiamare Luca alle 9")).toMatchObject({ date: "2026-10-11", time: "09:00" });
    expect(parse("chiamare Luca alle 11")).toMatchObject({ date: TODAY, time: "11:00" });
  });

  it("senza ora corrente resta oggi e 'tra due ore' non viene letto", () => {
    expect(parse("chiamare Luca alle 9", { now: undefined })).toMatchObject({ date: TODAY, time: "09:00" });
    expect(parse("tra due ore stendere", { now: undefined })).toMatchObject({ title: "Tra due ore stendere", date: null, time: null });
  });

  it("'tra N ore' può scavalcare la mezzanotte", () => {
    expect(parse("fra 3 ore spegnere tutto", { now: "22:30" })).toMatchObject({ date: "2026-10-11", time: "01:30" });
  });
});

describe("date ai bordi", () => {
  it("un giorno della settimana è sempre il prossimo, mai oggi", () => {
    expect(parse("mercato sabato")).toMatchObject({ date: "2026-10-17" });
  });

  it("i mesi si fermano all'ultimo giorno disponibile", () => {
    expect(parse("tra un mese pagare", { today: "2027-01-31" })).toMatchObject({ date: "2027-02-28" });
  });

  it("'il 31' salta i mesi che non lo hanno", () => {
    expect(parse("affitto entro il 31", { today: "2026-11-05" })).toMatchObject({ windowEnd: "2026-12-31" });
  });
});

describe("spans", () => {
  it("indica quale parte del testo ha generato ogni campo", () => {
    const text = "Dentista martedì alle 15";
    const { spans } = parse(text);
    expect(text.slice(spans.date!.start, spans.date!.end)).toBe("martedì");
    expect(text.slice(spans.time!.start, spans.time!.end)).toBe("alle 15");
  });

  it("copre prefisso, finestra, durata e parola chiave", () => {
    const text = "log: ceretta ieri";
    const { spans } = parse(text);
    expect(text.slice(spans.kind!.start, spans.kind!.end)).toBe("log: ");
    expect(text.slice(spans.category!.start, spans.category!.end)).toBe("ceretta");
    const windowText = "pagare entro fine mese, 45 min";
    const w = parse(windowText).spans;
    expect(windowText.slice(w.window!.start, w.window!.end)).toBe("entro fine mese");
    expect(windowText.slice(w.duration!.start, w.duration!.end)).toBe("45 min");
  });
});

describe("testo vuoto o senza senso", () => {
  it("non inventa nulla", () => {
    expect(parse("")).toMatchObject({ kind: "task", title: "", date: null });
    expect(parse("   ")).toMatchObject({ title: "" });
    expect(parse("spesa:")).toMatchObject({ kind: "shopping", title: "" });
  });
});

describe("allenamenti", () => {
  const activities = ["Allenamento", "Corsa", "Forza", "Pilates"];
  const workout = (text: string) => parse(text, { activities });

  it("una frase che comincia con una disciplina è un allenamento, con giorno, ora e durata", () => {
    expect(workout("corsa domani alle 18 45 min")).toMatchObject({ kind: "workout", title: "Corsa", date: "2026-10-11", time: "18:00", durationMin: 45, confidence: "high" });
    expect(workout("Allenamento gambe lunedì")).toMatchObject({ kind: "workout", title: "Allenamento gambe", date: "2026-10-12", time: null });
  });

  it("senza giorno vale per oggi; ieri resta ieri", () => {
    expect(workout("pilates")).toMatchObject({ kind: "workout", title: "Pilates", date: TODAY });
    expect(workout("corsa ieri 30 min")).toMatchObject({ kind: "workout", date: "2026-10-09", durationMin: 30 });
  });

  it("la disciplina deve aprire la frase ed essere una parola intera", () => {
    expect(workout("Comprare scarpe da corsa")).toMatchObject({ kind: "shopping" });
    expect(workout("Prenotare corsa campestre domani")).toMatchObject({ kind: "task" });
    expect(workout("Forzare la serratura domani")).toMatchObject({ kind: "task" });
  });

  it("con una ripetizione, una scadenza o un promemoria resta un'attività o un evento", () => {
    expect(workout("corsa ogni lunedì alle 7").kind).toBe("event");
    expect(workout("corsa entro domenica").kind).toBe("task");
    expect(workout("ricordami corsa domani").kind).toBe("task");
  });

  it("senza discipline note non cambia nulla, e il tipo scelto a mano vince", () => {
    expect(parse("corsa domani alle 18").kind).toBe("event");
    expect(parse("Dentista martedì alle 15", { kind: "workout" })).toMatchObject({ kind: "workout", title: "Dentista", date: "2026-10-13", time: "15:00" });
  });
});
