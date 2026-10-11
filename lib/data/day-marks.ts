import { type LocalDate } from "../dates/local";
import { toggleMarkOp } from "../days/marks";
import { deterministicId } from "../ids";
import { getSupabase } from "../supabase/client";
import type { DayMark, DayMarkKind } from "../supabase/types";
import { commit, currentOwner, withPendingDayMarks } from "../sync/engine";

/** I segni dei giorni da `from` a `to`, inclusi. */
export async function fetchDayMarks(from: LocalDate, to: LocalDate): Promise<DayMark[]> {
  const { data, error } = await getSupabase().from("day_marks").select("id, date, kind").gte("date", from).lte("date", to).order("date");
  if (error) throw new Error(error.message);
  return withPendingDayMarks(data as DayMark[], from, to);
}

/**
 * Mette o toglie un segno. `marks` sono i segni già noti del giorno.
 * L'id nasce da giorno e segno, così due dispositivi offline non ne creano due.
 */
export async function toggleDayMark(marks: DayMark[], date: LocalDate, kind: DayMarkKind): Promise<void> {
  const id = await deterministicId(`day-mark:${await currentOwner()}:${date}:${kind}`);
  await commit([toggleMarkOp(marks, id, date, kind)]);
}
