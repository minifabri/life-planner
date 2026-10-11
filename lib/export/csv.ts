/** Una cella: testo, numero, sì/no, elenco o vuoto. */
export type CsvValue = string | number | boolean | string[] | null | undefined;

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? (value ? "sì" : "no") : String(value);
  return /[",;\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV con intestazione, righe CRLF e BOM: così Excel e Numeri lo aprono in UTF-8 senza rovinare gli accenti.
 */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return "\uFEFF" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
