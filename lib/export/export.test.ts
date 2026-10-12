import { describe, expect, it } from "vitest";
import { atLocalTime } from "../dates/local";
import { parseIcs } from "../import/ics";
import { EXPORT_TABLES, buildExport, exportFileName, type ExportData } from "./bundle";
import { toCsv } from "./csv";
import { eventsToIcs } from "./ics";
import { crc32, createZip } from "./zip";

const TZ = "Europe/Rome";
// Il BOM in testa ai CSV fa parte del file: non va tolto leggendo.
const decode = (bytes: Uint8Array) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);

describe("zip", () => {
  it("calcola il CRC-32 di riferimento", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("scrive intestazioni, indice e chiusura coerenti", () => {
    const a = new TextEncoder().encode("ciao");
    const b = new TextEncoder().encode("perché no");
    const zip = createZip([{ name: "a.txt", data: a }, { name: "csv/caffè.csv", data: b }], new Date(2026, 9, 11, 8, 30, 0));
    const view = new DataView(zip.buffer);
    const eocd = zip.length - 22;

    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2);

    const centralStart = view.getUint32(eocd + 16, true);
    expect(view.getUint32(centralStart, true)).toBe(0x02014b50);
    expect(centralStart + view.getUint32(eocd + 12, true)).toBe(eocd);

    // Il secondo file: l'indice punta alla sua intestazione, che precede nome e contenuto intatti.
    const second = centralStart + 46 + 5;
    const offset = view.getUint32(second + 42, true);
    const nameLength = view.getUint16(offset + 26, true);
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    expect(view.getUint32(offset + 14, true)).toBe(crc32(b));
    expect(view.getUint32(offset + 18, true)).toBe(b.length);
    expect(decode(zip.subarray(offset + 30, offset + 30 + nameLength))).toBe("csv/caffè.csv");
    expect(decode(zip.subarray(offset + 30 + nameLength, offset + 30 + nameLength + b.length))).toBe("perché no");
  });

  it("un archivio vuoto è solo la chiusura", () => {
    expect(createZip([]).length).toBe(22);
  });
});

describe("csv", () => {
  it("mette tra virgolette ciò che contiene virgole, virgolette o a capo", () => {
    const csv = toCsv(["Nome", "Note"], [["Latte, intero", 'detto "bio"'], ["Pane", "riga\ndue"]]);
    expect(csv).toBe('﻿Nome,Note\r\n"Latte, intero","detto ""bio"""\r\nPane,"riga\ndue"\r\n');
  });

  it("scrive sì/no, elenchi, numeri e vuoti", () => {
    expect(toCsv(["a", "b", "c", "d", "e"], [[true, false, ["x", "y"], 12.5, null]])).toBe('﻿a,b,c,d,e\r\nsì,no,"x, y",12.5,\r\n');
  });
});

const event = (patch: Record<string, unknown>) => ({
  id: "e1",
  title: "Dentista",
  notes: null,
  location: null,
  start_at: atLocalTime("2026-10-12", "15:00", TZ).toISOString(),
  end_at: atLocalTime("2026-10-12", "16:00", TZ).toISOString(),
  all_day: false,
  start_date: null,
  end_date: null,
  tz: TZ,
  rrule: null,
  updated_at: "2026-10-01T08:00:00Z",
  ...patch,
});

describe("ics", () => {
  it("ciò che esce si rilegge con l'import", () => {
    const ics = eventsToIcs(
      [
        event({ location: "Via Roma 3; interno 2", notes: "Portare le lastre,\ne la tessera" }),
        event({ id: "e2", title: "Ferie", all_day: true, start_at: null, end_at: null, start_date: "2026-12-24", end_date: "2026-12-27" }),
        event({ id: "e3", title: "Yoga", rrule: "FREQ=WEEKLY;BYDAY=MO" }),
      ] as never,
      [{ event_id: "e3", original_start: atLocalTime("2026-10-19", "15:00", TZ).toISOString(), cancelled: true }],
    );
    const { items, skipped } = parseIcs(ics, TZ);
    expect(skipped).toEqual([]);
    const [dentist, holiday, yoga] = items;

    expect(dentist).toMatchObject({ title: "Dentista", location: "Via Roma 3; interno 2", notes: "Portare le lastre,\ne la tessera", allDay: false });
    expect(new Date(dentist.startAt!)).toEqual(atLocalTime("2026-10-12", "15:00", TZ));
    expect(new Date(dentist.endAt!)).toEqual(atLocalTime("2026-10-12", "16:00", TZ));
    expect(holiday).toMatchObject({ title: "Ferie", allDay: true, startDate: "2026-12-24", endDate: "2026-12-27" });
    expect(yoga).toMatchObject({ title: "Yoga", rrule: "FREQ=WEEKLY;BYDAY=MO", tz: TZ, cancelledDates: ["2026-10-19"] });
    expect(new Date(yoga.startAt!)).toEqual(atLocalTime("2026-10-12", "15:00", TZ));
  });

  it("spezza le righe lunghe a 75 ottetti", () => {
    const ics = eventsToIcs([event({ title: "è".repeat(120) })] as never);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(parseIcs(ics, TZ).items[0].title).toBe("è".repeat(120));
  });

  it("un calendario senza eventi resta valido", () => {
    expect(eventsToIcs([])).toBe("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Life Planner//Export//IT\r\nCALSCALE:GREGORIAN\r\nEND:VCALENDAR\r\n");
  });
});

describe("buildExport", () => {
  const empty = Object.fromEntries(EXPORT_TABLES.map((t) => [t.name, []])) as unknown as ExportData;
  const data: ExportData = {
    ...empty,
    profiles: [{ owner_id: "u", display_name: "Bibi", log_lock_pin_hash: "segreto", log_lock_webauthn: { id: "x" } }],
    log_categories: [{ id: "c1", name: "Unghie" }],
    log_entries: [
      { id: "l2", category_id: null, title: "Taglio", notes: null, date: "2026-10-02", time: null, tags: [], is_sensitive: false, deleted_at: null },
      { id: "l1", category_id: "c1", title: "Semipermanente", notes: "rosso", date: "2026-09-12", time: "10:30:00", tags: ["mani"], is_sensitive: false, deleted_at: null },
      { id: "l3", category_id: null, title: "Cancellata", notes: null, date: "2026-10-03", time: null, tags: [], is_sensitive: false, deleted_at: "2026-10-04T00:00:00Z" },
    ],
    shopping_items: [{ id: "s1", name: "Latte", quantity: "2", department: "Frigo", checked: true, created_at: "2026-10-01T09:00:00Z", deleted_at: null }],
    meal_plans: [
      { id: "m2", date: "2026-10-12", slot: "dinner", name: "Zuppa", prep_mode: "ready", prepared: false },
      { id: "m1", date: "2026-10-12", slot: "lunch", name: "Pasta al ragù", prep_mode: "to_prep", prepared: true },
    ],
    events: [
      event({ source: "app", deleted_at: null }),
      event({ id: "e9", title: "Da iCloud", source: "icloud", deleted_at: null }),
      event({ id: "e8", title: "Eliminato", source: "app", deleted_at: "2026-10-02T00:00:00Z" }),
    ],
  };
  const files = buildExport(data, { exportedAt: new Date("2026-10-11T07:00:00Z"), includesSensitive: false });
  const read = (name: string) => decode(files.find((f) => f.name === name)!.data);

  it("ha un JSON per ogni tabella, i quattro CSV, il calendario e le istruzioni", () => {
    expect(files.map((f) => f.name)).toEqual([
      "LEGGIMI.txt",
      ...EXPORT_TABLES.map((t) => `json/${t.name}.json`),
      "csv/spesa.csv",
      "csv/wishlist.csv",
      "csv/log.csv",
      "csv/pasti.csv",
      "eventi.ics",
    ]);
  });

  it("tiene fuori PIN e chiavi del blocco", () => {
    expect(JSON.parse(read("json/profiles.json"))).toEqual([{ owner_id: "u", display_name: "Bibi" }]);
  });

  it("il JSON conserva anche gli eliminati, i CSV no", () => {
    expect(JSON.parse(read("json/log_entries.json"))).toHaveLength(3);
    expect(read("csv/log.csv")).toBe(
      "﻿Data,Ora,Categoria,Titolo,Note,Tag,Riservata\r\n2026-09-12,10:30,Unghie,Semipermanente,rosso,mani,no\r\n2026-10-02,,,Taglio,,,no\r\n",
    );
  });

  it("scrive Spesa e Pasti in italiano e in ordine", () => {
    expect(read("csv/spesa.csv")).toBe("﻿Nome,Quantità,Reparto,Presa,Aggiunta il\r\nLatte,2,Frigo,sì,2026-10-01\r\n");
    expect(read("csv/pasti.csv")).toBe("﻿Data,Pasto,Nome,Da preparare,Preparato,Fuori\r\n2026-10-12,Pranzo,Pasta al ragù,sì,sì,no\r\n2026-10-12,Cena,Zuppa,no,no,no\r\n");
  });

  it("nel calendario vanno solo gli eventi creati nell'app e non eliminati", () => {
    expect(parseIcs(read("eventi.ics"), TZ).items.map((i) => i.title)).toEqual(["Dentista"]);
  });

  it("le istruzioni dicono se le registrazioni riservate ci sono", () => {
    expect(read("LEGGIMI.txt")).toContain("NON sono incluse");
    const full = buildExport(data, { exportedAt: new Date("2026-10-11T07:00:00Z"), includesSensitive: true });
    expect(decode(full[0].data)).toContain("sono incluse: tieni questo archivio in un posto sicuro");
  });

  it("dà all'archivio il nome con la data", () => {
    expect(exportFileName(new Date("2026-10-11T07:00:00Z"))).toBe("life-planner-2026-10-11.zip");
  });
});
