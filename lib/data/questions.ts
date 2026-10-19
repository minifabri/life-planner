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

/** Salva una risposta. Restituisce la funzione che la annulla. */
export async function saveAnswer(key: string, answer: string): Promise<() => Promise<void>> {
  const { ops, undo } = answerOps(uuidv7(), key, answer);
  await commit(ops);
  return () => commit(undo);
}

/** Porta sul server le risposte salvate sul dispositivo dalle versioni precedenti, poi le toglie dal dispositivo. */
export async function importDeviceAnswers(storageKey: string, answer: string): Promise<void> {
  let keys: string[] = [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (Array.isArray(value)) keys = value.filter((v): v is string => typeof v === "string");
  } catch {
    return;
  }
  if (keys.length > 0) await commit(keys.flatMap((key) => answerOps(uuidv7(), key, answer).ops));
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Resta sul dispositivo: alla prossima apertura si riprova, rifarlo non duplica.
  }
}
