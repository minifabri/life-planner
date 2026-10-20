import { type LocalDate } from "../dates/local";
import { toggleMarkPlan } from "../days/marks";
import { travelAnswerKey } from "../days/travel";
import { deterministicId, uuidv7 } from "../ids";
import { getSupabase } from "../supabase/client";
import type { DayMark, DayMarkKind } from "../supabase/types";
import { commit, currentOwner, withPendingDayMarks } from "../sync/engine";
import { answerOps } from "../wishlist/shipments";

/** I segni dei giorni da `from` a `to`, inclusi. */
export async function fetchDayMarks(from: LocalDate, to: LocalDate): Promise<DayMark[]> {
  const { data, error } = await getSupabase().from("day_marks").select("id, date, kind").gte("date", from).lte("date", to).order("date");
  if (error) throw new Error(error.message);
  return withPendingDayMarks(data as DayMark[], from, to);
}

/**
 * Mette o toglie un segno. `marks` sono i segni già noti del giorno, con quelli ricavati dal calendario.
 * L'id nasce da giorno e segno, così due dispositivi offline non ne creano due.
 * Togliendo un viaggio che dice il calendario, la scelta si salva tra le risposte (vale su tutti i dispositivi)
 * e si restituisce la funzione che la annulla; negli altri casi null, perché basta un altro tocco.
 */
export async function toggleDayMark(marks: DayMark[], date: LocalDate, kind: DayMarkKind): Promise<(() => Promise<void>) | null> {
  const id = await deterministicId(`day-mark:${await currentOwner()}:${date}:${kind}`);
  const plan = toggleMarkPlan(marks, id, date, kind);
  if (!plan.dismiss) {
    await commit(plan.ops);
    return null;
  }
  const answer = answerOps(uuidv7(), travelAnswerKey(date), "no", true);
  await commit([...plan.ops, ...answer.ops]);
  return () => commit([...answer.undo, ...plan.restore]);
}
