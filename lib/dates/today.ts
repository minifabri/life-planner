import { TZDate } from "@date-fns/tz";
import { format, getISOWeek } from "date-fns";
import { it } from "date-fns/locale";

export const DEFAULT_TZ = "Europe/Rome";

/** Data locale (YYYY-MM-DD) di "oggi" nel fuso indicato. */
export function localDateString(now: Date = new Date(), tz: string = DEFAULT_TZ): string {
  return format(new TZDate(now, tz), "yyyy-MM-dd");
}

/** Intestazione della vista Oggi: "Venerdì", "9 ott", "Settimana 41". */
export function todayHeading(now: Date = new Date(), tz: string = DEFAULT_TZ) {
  const d = new TZDate(now, tz);
  const weekday = format(d, "EEEE", { locale: it });
  return {
    weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
    dayMonth: format(d, "d MMM", { locale: it }),
    week: getISOWeek(d),
  };
}
