import { uuidv7 } from "../ids";
import { getSupabase } from "../supabase/client";
import type { QuestionAnswer } from "../supabase/types";
import { commit, withPendingAnswers } from "../sync/engine";
import { answerOps } from "../wishlist/shipments";

/** Risposte alle domande dell'app (D70), sul server: valgono su tutti i dispositivi. */
export const ANSWERS_KEY = ["question-answers"];

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export async function fetchAnswers(): Promise<QuestionAnswer[]> {
  const rows: QuestionAnswer[] = check(
    await getSupabase().from("question_answers").select("id, key, answer, created_at").order("created_at", { ascending: false }).limit(1000),
  );
  return withPendingAnswers(rows);
}

/** Salva una risposta (con `replace` aggiorna quella già data). Restituisce la funzione che la annulla. */
export async function saveAnswer(key: string, answer: string, replace = false): Promise<() => Promise<void>> {
  const { ops, undo } = answerOps(uuidv7(), key, answer, replace);
  await commit(ops);
  return () => commit(undo);
}

/** Toglie una risposta: la domanda torna. */
export async function forgetAnswer(key: string): Promise<void> {
  await commit(answerOps(uuidv7(), key, "").undo);
}

/** Legge dal dispositivo un valore JSON lasciato dalle versioni precedenti; null se manca o non si legge. */
function readDevice(storageKey: string): unknown {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/**
 * Porta sul server le risposte salvate sul dispositivo dalle versioni precedenti, poi le toglie dal dispositivo.
 * `toAnswers` trasforma quello che c'era salvato nelle risposte da scrivere.
 */
export async function importDevice(storageKey: string, toAnswers: (value: unknown) => { key: string; answer: string }[]): Promise<void> {
  const value = readDevice(storageKey);
  if (value === null) return;
  const answers = toAnswers(value);
  if (answers.length > 0) await commit(answers.flatMap(({ key, answer }) => answerOps(uuidv7(), key, answer).ops));
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Resta sul dispositivo: alla prossima apertura si riprova, rifarlo non duplica.
  }
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

/** Come `importDevice`, per un elenco di chiavi: ognuna diventa `toKey(chiave)` con la risposta `answer`. */
export function importDeviceAnswers(storageKey: string, answer: string, toKey: (key: string) => string = (k) => k): Promise<void> {
  return importDevice(storageKey, (value) => strings(value).map((k) => ({ key: toKey(k), answer })));
}
