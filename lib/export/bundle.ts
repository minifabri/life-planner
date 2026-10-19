import { toCsv } from "./csv";
import { eventsToIcs } from "./ics";
import type { ZipEntry } from "./zip";
import type { EventException, EventRow } from "../supabase/types";

/**
 * Contenuto dell'export (technical-design.md, 10): un JSON per tabella con tutte le righe,
 * CSV leggibili per Spesa, Wishlist, Log e Pasti, e gli eventi creati nell'app in formato calendario.
 */

type Row = Record<string, unknown>;

/** Tabelle esportate, con la colonna che dà un ordine stabile per leggerle a pagine. */
export const EXPORT_TABLES = [
  { name: "profiles", key: "owner_id" },
  { name: "areas", key: "id" },
  { name: "tasks", key: "id" },
  { name: "recurrences", key: "id" },
  { name: "events", key: "id" },
  { name: "event_exceptions", key: "id" },
  { name: "workouts", key: "id" },
  { name: "day_marks", key: "id" },
  { name: "meal_plans", key: "id" },
  { name: "meal_memory", key: "id" },
  { name: "log_categories", key: "id" },
  { name: "log_entries", key: "id" },
  { name: "lists", key: "id" },
  { name: "shopping_items", key: "id" },
  { name: "product_memory", key: "id" },
  { name: "wishlist_items", key: "id" },
  { name: "templates", key: "id" },
  { name: "icloud_calendars", key: "id" },
] as const;

export type ExportTable = (typeof EXPORT_TABLES)[number]["name"];
export type ExportData = Record<ExportTable, Row[]>;

/** Colonne che non sono dati di Bibi ma chiavi di accesso: restano fuori dall'archivio. */
const SECRET_COLUMNS: Partial<Record<ExportTable, string[]>> = { profiles: ["log_lock_pin_hash", "log_lock_webauthn"] };

const SLOT: Record<string, string> = { breakfast: "Colazione", lunch: "Pranzo", snack: "Merenda", dinner: "Cena", extra: "Extra" };
const SLOT_ORDER = ["breakfast", "lunch", "snack", "dinner", "extra"];
const WISH_STATUS: Record<string, string> = { wanted: "Desiderato", bought: "Comprato", discarded: "Scartato", arrived: "Arrivato, da decidere", returning: "Da restituire", returned: "Restituito" };

const text = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
const alive = (rows: Row[]) => rows.filter((r) => !r.deleted_at);
const byText = (key: string) => (a: Row, b: Row) => text(a[key]).localeCompare(text(b[key]));

function withoutSecrets(table: ExportTable, rows: Row[]): Row[] {
  const hidden = SECRET_COLUMNS[table];
  if (!hidden) return rows;
  return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !hidden.includes(k))));
}

export type ExportOptions = {
  exportedAt: Date;
  /** Falso se il Log era bloccato: registrazioni, attività ed eventi riservati non sono nell'archivio. */
  includesSensitive: boolean;
};

export function exportFileName(exportedAt: Date): string {
  return `life-planner-${exportedAt.toISOString().slice(0, 10)}.zip`;
}

function readme(data: ExportData, options: ExportOptions): string {
  const lines = [
    "Life Planner — esportazione dei dati",
    `Creata il ${options.exportedAt.toISOString()}`,
    "",
    "json/      un file per tabella, con tutte le righe e tutte le colonne (anche gli elementi eliminati di recente)",
    "csv/       Spesa, Wishlist, Log e Pasti da aprire con un foglio di calcolo (solo elementi non eliminati)",
    "eventi.ics gli eventi creati nell'app, da importare in un calendario",
    "",
    options.includesSensitive
      ? "Ciò che è riservato (registrazioni del Log, attività ed eventi) è incluso: tieni questo archivio in un posto sicuro."
      : "Ciò che è riservato (registrazioni del Log, attività ed eventi) NON è incluso, perché il Log era bloccato. Sbloccalo e ripeti l'esportazione per averlo.",
    "Non sono inclusi: PIN e chiavi del blocco, credenziali dei calendari collegati, dispositivi delle notifiche.",
    "",
    "Righe per tabella:",
    ...EXPORT_TABLES.map((t) => `  ${t.name}: ${data[t.name].length}`),
  ];
  return lines.join("\r\n") + "\r\n";
}

/** I file dell'archivio, pronti per `createZip`. */
export function buildExport(data: ExportData, options: ExportOptions): ZipEntry[] {
  const encoder = new TextEncoder();
  const file = (name: string, content: string): ZipEntry => ({ name, data: encoder.encode(content) });
  const categories = new Map(data.log_categories.map((c) => [c.id, text(c.name)]));

  const shopping = toCsv(
    ["Nome", "Quantità", "Reparto", "Presa", "Aggiunta il"],
    alive(data.shopping_items)
      .sort(byText("created_at"))
      .map((r) => [text(r.name), text(r.quantity), text(r.department), r.checked === true, text(r.created_at).slice(0, 10)]),
  );
  const wishlist = toCsv(
    ["Nome", "Marca", "Categoria", "Prezzo", "Valuta", "Link", "Interesse", "Stato", "Note"],
    alive(data.wishlist_items)
      .sort(byText("created_at"))
      .map((r) => [
        text(r.name),
        text(r.brand),
        text(r.category),
        r.price_amount as number | null,
        text(r.price_currency),
        text(r.url),
        r.interest as number | null,
        WISH_STATUS[text(r.status)] ?? text(r.status),
        text(r.notes),
      ]),
  );
  const log = toCsv(
    ["Data", "Ora", "Categoria", "Titolo", "Note", "Tag", "Riservata"],
    alive(data.log_entries)
      .sort((a, b) => byText("date")(a, b) || byText("time")(a, b))
      .map((r) => [
        text(r.date),
        text(r.time).slice(0, 5),
        categories.get(r.category_id) ?? "",
        text(r.title),
        text(r.notes),
        Array.isArray(r.tags) ? (r.tags as string[]) : [],
        r.is_sensitive === true,
      ]),
  );
  const meals = toCsv(
    ["Data", "Pasto", "Nome", "Condimenti", "Da preparare", "Preparato", "Fuori"],
    [...data.meal_plans]
      .sort((a, b) => byText("date")(a, b) || SLOT_ORDER.indexOf(text(a.slot)) - SLOT_ORDER.indexOf(text(b.slot)))
      .map((r) => [text(r.date), SLOT[text(r.slot)] ?? text(r.slot), text(r.name), text(r.condiments), r.prep_mode === "to_prep", r.prepared === true, r.eaten_out === true]),
  );

  const appEvents = alive(data.events).filter((e) => e.source === "app") as unknown as EventRow[];
  const ics = eventsToIcs(appEvents, data.event_exceptions as unknown as EventException[]);

  return [
    file("LEGGIMI.txt", readme(data, options)),
    ...EXPORT_TABLES.map((t) => file(`json/${t.name}.json`, JSON.stringify(withoutSecrets(t.name, data[t.name]), null, 2) + "\n")),
    file("csv/spesa.csv", shopping),
    file("csv/wishlist.csv", wishlist),
    file("csv/log.csv", log),
    file("csv/pasti.csv", meals),
    file("eventi.ics", ics),
  ];
}
