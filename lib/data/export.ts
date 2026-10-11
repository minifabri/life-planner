import { EXPORT_TABLES, buildExport, exportFileName, type ExportData } from "../export/bundle";
import { createZip } from "../export/zip";
import { getSupabase } from "../supabase/client";

const PAGE = 1000;

type Row = Record<string, unknown>;

/** Tutte le righe di una tabella, a pagine (il server ne restituisce al più mille per volta). */
async function fetchAll(table: string, key: string, onlyOpenLog: boolean): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = getSupabase().from(table).select("*");
    if (onlyOpenLog) query = query.eq("is_sensitive", false);
    const { data, error } = await query.order(key).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

export type ExportFile = { name: string; blob: Blob; rows: number };

/**
 * Prepara l'archivio con tutti i dati (technical-design.md, 10). Tutto avviene nel browser: i dati
 * vanno da Supabase al dispositivo e da nessun'altra parte. A Log bloccato le registrazioni riservate restano sul server.
 */
export async function createExport(logUnlocked: boolean): Promise<ExportFile> {
  const data = {} as ExportData;
  for (const t of EXPORT_TABLES) data[t.name] = await fetchAll(t.name, t.key, t.name === "log_entries" && !logUnlocked);
  const exportedAt = new Date();
  const zip = createZip(buildExport(data, { exportedAt, includesSensitive: logUnlocked }), exportedAt);
  return {
    name: exportFileName(exportedAt),
    blob: new Blob([zip], { type: "application/zip" }),
    rows: EXPORT_TABLES.reduce((n, t) => n + data[t.name].length, 0),
  };
}

/**
 * Consegna l'archivio: dove c'è la condivisione di file (iPhone, anche con l'app installata) apre il foglio
 * "Salva su File"; altrove lo scarica. Restituisce falso se la persona ha chiuso il foglio senza salvare.
 */
export async function deliverExport(file: ExportFile): Promise<boolean> {
  const shareable = new File([file.blob], file.name, { type: "application/zip" });
  const touch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;
  if (touch && navigator.canShare?.({ files: [shareable] })) {
    try {
      await navigator.share({ files: [shareable], title: file.name });
      return true;
    } catch (e) {
      if ((e as Error).name === "AbortError") return false;
      // La condivisione non è riuscita: si prova a scaricare.
    }
  }
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/**
 * Elimina l'account e tutti i suoi dati (Edge Function `delete-account`). Non si può annullare.
 * `confirm` deve essere l'email dell'account, ricontrollata dal server.
 */
export async function deleteAccount(confirm: string): Promise<void> {
  const { data, error } = await getSupabase().functions.invoke("delete-account", { body: { confirm } });
  if (error || !data?.deleted) throw new Error(error?.message ?? "Eliminazione non riuscita");
}
