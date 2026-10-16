// File generato da scripts/build-functions.mjs a partire da lib/reminders/plan.ts. Non modificare a mano.

// lib/dates/local.ts
import { TZDate as TZDate2 } from "npm:@date-fns/tz@1.5.0";

// lib/dates/today.ts
import { TZDate } from "npm:@date-fns/tz@1.5.0";
import { format, getISOWeek } from "npm:date-fns@4.4.0";
import { it } from "npm:date-fns@4.4.0/locale";
var DEFAULT_TZ = "Europe/Rome";
function localDateString(now = /* @__PURE__ */ new Date(), tz = DEFAULT_TZ) {
  return format(new TZDate(now, tz), "yyyy-MM-dd");
}

// lib/dates/local.ts
var DAY_MS = 864e5;
function toUtc(d) {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}
function fromUtc(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
function addDays(d, n) {
  return fromUtc(toUtc(d) + n * DAY_MS);
}
function diffDays(a, b) {
  return Math.round((toUtc(a) - toUtc(b)) / DAY_MS);
}
function fmt(d, options) {
  return new Intl.DateTimeFormat("it-IT", { ...options, timeZone: "UTC" }).format(toUtc(d));
}
function weekdayName(d) {
  return fmt(d, { weekday: "long" });
}
function shortDate(d) {
  return fmt(d, { day: "numeric", month: "short" }).replace(".", "");
}
function relativeDay(d, today) {
  const delta = diffDays(d, today);
  if (delta === 0) return "oggi";
  if (delta === 1) return "domani";
  if (delta === -1) return "ieri";
  if (delta > 1 && delta < 7) return weekdayName(d);
  return shortDate(d);
}
function startOfLocalDay(d, tz = DEFAULT_TZ) {
  return atLocalTime(d, "00:00", tz);
}
function atLocalTime(d, time, tz = DEFAULT_TZ) {
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(new TZDate2(y, m - 1, day, hh, mm, 0, tz).getTime());
}
function localTimeString(instant, tz = DEFAULT_TZ) {
  const d = new TZDate2(instant.getTime(), tz);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function trimTime(time) {
  return time.slice(0, 5);
}

// cjs-shim:rrule
import pkg from "npm:rrule@2.8.1";
var RRule = pkg.RRule;

// lib/recurrence/expand.ts
function utc(d) {
  return /* @__PURE__ */ new Date(`${d}T00:00:00Z`);
}
function occurrenceDates(rrule, start, from, to) {
  if (to < from || to < start) return [];
  const options = RRule.parseString(rrule.replace(/^RRULE:/i, ""));
  const rule = new RRule({ ...options, dtstart: utc(start) });
  return rule.between(utc(from), utc(to), true).map((d) => d.toISOString().slice(0, 10));
}

// lib/events/day.ts
function eventsForDay(events, exceptions, day, tz = DEFAULT_TZ) {
  const dayStart = startOfLocalDay(day, tz);
  const dayEnd = startOfLocalDay(addDays(day, 1), tz);
  const byEvent = /* @__PURE__ */ new Map();
  for (const ex of exceptions) {
    const map = byEvent.get(ex.event_id) ?? /* @__PURE__ */ new Map();
    map.set(new Date(ex.original_start).getTime(), ex);
    byEvent.set(ex.event_id, map);
  }
  const out = [];
  for (const event of events) {
    if (event.deleted_at) continue;
    const exMap = byEvent.get(event.id);
    if (event.all_day) {
      if (!event.start_date) continue;
      const span = event.end_date && event.end_date > event.start_date ? event.end_date : event.start_date;
      const starts2 = event.rrule ? occurrenceDates(event.rrule, event.start_date, day, day) : event.start_date <= day && day <= span ? [event.start_date] : [];
      for (const d of starts2) {
        const originalStart = startOfLocalDay(d, event.tz);
        if (exMap?.get(originalStart.getTime())?.cancelled) continue;
        out.push({
          key: `${event.id}:${d}`,
          event,
          allDay: true,
          start: null,
          end: null,
          originalStart,
          startTime: null,
          endTime: null,
          durationMin: null
        });
      }
      continue;
    }
    if (!event.start_at) continue;
    const firstStart = new Date(event.start_at);
    const durationMs = event.end_at ? Math.max(0, new Date(event.end_at).getTime() - firstStart.getTime()) : 0;
    let starts;
    if (event.rrule) {
      const startDate = localDateString(firstStart, event.tz);
      const wallTime = localTimeString(firstStart, event.tz);
      starts = occurrenceDates(event.rrule, startDate, addDays(day, -1), addDays(day, 1)).map(
        (d) => atLocalTime(d, wallTime, event.tz)
      );
    } else {
      starts = [firstStart];
    }
    for (const originalStart of starts) {
      const ex = exMap?.get(originalStart.getTime());
      if (ex?.cancelled) continue;
      const start = ex?.new_start_at ? new Date(ex.new_start_at) : originalStart;
      const end = ex?.new_end_at ? new Date(ex.new_end_at) : new Date(start.getTime() + durationMs);
      const overlaps = start < dayEnd && (end > dayStart || start >= dayStart);
      if (!overlaps) continue;
      out.push({
        key: `${event.id}:${originalStart.toISOString()}`,
        event,
        allDay: false,
        start,
        end,
        originalStart,
        startTime: start >= dayStart ? localTimeString(start, tz) : "00:00",
        endTime: event.end_at || ex?.new_end_at ? localTimeString(end, tz) : null,
        durationMin: durationMs ? Math.round((Math.min(end.getTime(), dayEnd.getTime()) - Math.max(start.getTime(), dayStart.getTime())) / 6e4) : null
      });
    }
  }
  return out.sort(
    (a, b) => Number(b.allDay) - Number(a.allDay) || (a.startTime ?? "").localeCompare(b.startTime ?? "")
  );
}

// lib/tasks/classify.ts
function windowStartOf(task, tz = DEFAULT_TZ) {
  return task.window_start ?? localDateString(new Date(task.created_at), tz);
}
function promotionLead(windowStart, due) {
  return diffDays(due, windowStart) <= 7 ? 1 : 3;
}
function isPromoted(task, today, tz = DEFAULT_TZ) {
  if (task.date || !task.due_date || task.due_date < today) return false;
  const lead = promotionLead(windowStartOf(task, tz), task.due_date);
  return today >= addDays(task.due_date, -lead);
}
function classifyTask(task, day, today, tz = DEFAULT_TZ) {
  if (task.deleted_at || task.status === "dismissed") return null;
  if (task.status === "done") {
    if (task.date === day) return task.time ? "agenda" : "todo";
    if (task.completed_at && localDateString(new Date(task.completed_at), tz) === day) return "todo";
    return null;
  }
  if (task.date) {
    if (task.date === day) return task.time ? "agenda" : "todo";
    if (task.date < today && day === today) return "overdue";
    return null;
  }
  if (task.due_date) {
    if (task.due_date < today) return day === today ? "overdue" : null;
    if (day === today) return isPromoted(task, today, tz) ? "todo" : "window";
    return day > today && day === task.due_date ? "todo" : null;
  }
  return null;
}
function overdueSince(task) {
  return task.original_date ?? task.date ?? task.due_date;
}
var ATTENTION_ORDER = { high: 0, medium: 1, low: 2 };
function groupTasks(tasks, day, today, tz = DEFAULT_TZ) {
  const out = { overdue: [], agenda: [], todo: [], window: [] };
  for (const t of tasks) {
    const section = classifyTask(t, day, today, tz);
    if (section) out[section].push(t);
  }
  out.overdue.sort((a, b) => (overdueSince(a) ?? "").localeCompare(overdueSince(b) ?? ""));
  out.agenda.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  out.todo.sort(
    (a, b) => Number(a.status === "done") - Number(b.status === "done") || ATTENTION_ORDER[a.attention] - ATTENTION_ORDER[b.attention] || a.created_at.localeCompare(b.created_at)
  );
  out.window.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  return out;
}

// lib/today/overview.ts
var DEFAULT_EVENING_TIME = "20:30";
function overviewMode(nowTime, eveningTime = DEFAULT_EVENING_TIME) {
  return nowTime >= eveningTime.slice(0, 5) ? "evening" : "morning";
}
function greeting(nowTime, eveningTime = DEFAULT_EVENING_TIME) {
  if (overviewMode(nowTime, eveningTime) === "evening") return "Buonasera";
  return nowTime < "13:00" ? "Buongiorno" : "Buon pomeriggio";
}
function salute(word, name) {
  const n = name?.trim();
  return n ? `${word}, ${n}.` : `${word}.`;
}
var count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function nextDeadline(tasks, today) {
  const last = addDays(today, 6);
  const rank = { high: 0, medium: 1, low: 2 };
  const upcoming = tasks.filter((t) => t.status === "open" && !t.deleted_at && !t.date && t.due_date && t.due_date > today && t.due_date <= last).sort((a, b) => a.due_date.localeCompare(b.due_date) || rank[a.attention] - rank[b.attention]);
  return upcoming[0] ?? null;
}
function morningOverview(input) {
  const { events, openTasks, overdue, today } = input;
  const parts = [
    events ? count(events, "appuntamento", "appuntamenti") : null,
    openTasks.length ? `${openTasks.length} attivit\xE0` : null
  ].filter(Boolean);
  let day = parts.length ? `Oggi ${parts.join(" e ")}` : "Oggi niente in programma";
  const dueToday = openTasks.filter((t) => t.due_date === today).length;
  if (dueToday) day += dueToday === 1 ? "; una scade oggi" : `; ${dueToday} scadono oggi`;
  const extra = [
    parts.length && input.loadLabel ? input.loadLabel : null,
    overdue ? count(overdue, "rimasta indietro", "rimaste indietro") : null
  ].filter(Boolean);
  const tail = extra.length ? ` ${extra[0]}${extra.slice(1).map((e) => `, ${e}`).join("")}.` : "";
  const next = nextDeadline(input.allTasks, today);
  const when = next ? relativeDay(next.due_date, today) : "";
  return {
    text: `${salute(greeting(input.nowTime, input.eveningTime), input.name)} ${day}.${tail}`,
    note: next ? `${when.charAt(0).toUpperCase()}${when.slice(1)} scade \xAB${next.title}\xBB.` : null
  };
}
function eveningHeading(name, open) {
  const rest = open === 0 ? "Tutto fatto per oggi." : open === 1 ? "Resta un'attivit\xE0 aperta." : `Restano ${open} attivit\xE0 aperte.`;
  return `${salute("Buonasera", name)} ${rest}`;
}

// lib/reminders/plan.ts
function inQuietHours(time, start, end) {
  const [t, s, e] = [trimTime(time), trimTime(start), trimTime(end)];
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}
function afterQuietHours(instant, settings) {
  const { timezone: tz, quiet_start, quiet_end } = settings;
  const time = localTimeString(instant, tz);
  if (!inQuietHours(time, quiet_start, quiet_end)) return instant;
  const day = localDateString(instant, tz);
  const end = trimTime(quiet_end);
  return atLocalTime(time >= end ? addDays(day, 1) : day, end, tz);
}
function sentence(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function enabled(attention, s) {
  return attention === "high" ? s.notify_high : attention === "medium" ? s.notify_medium : false;
}
function planReminders(input, from, to) {
  const { settings: s, tasks, events, exceptions } = input;
  const tz = s.timezone;
  const morning = trimTime(s.morning_overview_time);
  const evening = trimTime(s.evening_review_time);
  const out = [];
  function add(r, at, bypassQuiet, updatedAt, day, body) {
    const fireAt = bypassQuiet ? at : afterQuietHours(at, s);
    if (fireAt <= from || fireAt > to) return;
    if (new Date(updatedAt) > fireAt) return;
    out.push({ ...r, fireAt, body: sentence(body(relativeDay(day, localDateString(fireAt, tz)))) });
  }
  const firstDay = addDays(localDateString(from, tz), -1);
  const lastDay = addDays(localDateString(to, tz), 1);
  for (const t of tasks) {
    if (t.deleted_at || t.status !== "open") continue;
    if (t.source === "meal") {
      if (!s.notify_meal_prep || !t.date) continue;
      const time2 = t.time ? trimTime(t.time) : null;
      add(
        { key: `task:${t.id}:meal:${t.date}${time2 ? `T${time2}` : ""}`, targetType: "task", targetId: t.id, title: t.title, url: "/today" },
        atLocalTime(t.date, time2 ?? trimTime(s.meal_prep_reminder_time), tz),
        false,
        t.updated_at,
        t.date,
        () => t.notes ?? ""
      );
      continue;
    }
    if (!t.remind && !enabled(t.attention, s)) continue;
    const day = t.date ?? t.due_date;
    if (!day || day < firstDay || day > lastDay) continue;
    const time = t.date && t.time ? trimTime(t.time) : null;
    const bypass = t.attention === "high" && s.quiet_allow_high;
    const base = { targetType: "task", targetId: t.id, title: t.title, url: "/today" };
    const stamp = `${day}${time ? `T${time}` : ""}`;
    const body = (when) => time ? `${when} alle ${time}` : t.date ? `Da fare ${when}` : `Scade ${when}`;
    add({ ...base, key: `task:${t.id}:at:${stamp}` }, atLocalTime(day, time ?? morning, tz), bypass, t.updated_at, day, body);
    if (t.attention === "high" && s.notify_high) {
      add({ ...base, key: `task:${t.id}:before:${stamp}` }, atLocalTime(addDays(day, -1), time ?? evening, tz), bypass, t.updated_at, day, body);
    }
  }
  const noisy = events.filter((e) => !e.deleted_at && enabled(e.attention, s));
  if (noisy.length) {
    const seen = /* @__PURE__ */ new Set();
    for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
      for (const o of eventsForDay(noisy, exceptions, day, tz)) {
        if (seen.has(o.key)) continue;
        seen.add(o.key);
        const e = o.event;
        const bypass = e.attention === "high" && s.quiet_allow_high;
        const base = { targetType: "event", targetId: e.id, title: e.title, url: "/today" };
        if (o.allDay || !o.start) {
          const date2 = localDateString(o.originalStart, e.tz);
          const body2 = (when) => `${when}, tutto il giorno`;
          add({ ...base, key: `event:${e.id}:at:${date2}` }, atLocalTime(date2, morning, tz), bypass, e.updated_at, date2, body2);
          if (e.attention === "high") {
            add({ ...base, key: `event:${e.id}:before:${date2}` }, atLocalTime(addDays(date2, -1), evening, tz), bypass, e.updated_at, date2, body2);
          }
          continue;
        }
        const stamp = o.start.toISOString();
        const date = localDateString(o.start, tz);
        const time = localTimeString(o.start, tz);
        const body = (when) => `${when} alle ${time}${e.location ? ` \xB7 ${e.location}` : ""}`;
        add({ ...base, key: `event:${e.id}:at:${stamp}` }, o.start, bypass, e.updated_at, date, body);
        if (e.attention === "high") {
          add({ ...base, key: `event:${e.id}:before:${stamp}` }, atLocalTime(addDays(date, -1), time, tz), bypass, e.updated_at, date, body);
        }
      }
    }
  }
  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
    if (s.notify_morning) {
      const fireAt = afterQuietHours(atLocalTime(day, morning, tz), s);
      if (fireAt > from && fireAt <= to) {
        const sections = groupTasks(tasks, day, day, tz);
        const overview = morningOverview({
          name: input.name,
          nowTime: morning,
          eveningTime: evening,
          events: eventsForDay(events, exceptions, day, tz).length,
          openTasks: [...sections.agenda, ...sections.todo].filter((t) => t.status === "open"),
          overdue: sections.overdue.length,
          allTasks: tasks,
          today: day
        });
        out.push({
          key: `digest:morning:${day}`,
          targetType: "digest",
          targetId: null,
          fireAt,
          title: "La tua giornata",
          body: overview.note ? `${overview.text} ${overview.note}` : overview.text,
          url: "/today"
        });
      }
    }
    if (s.notify_evening) {
      const fireAt = afterQuietHours(atLocalTime(day, evening, tz), s);
      if (fireAt > from && fireAt <= to) {
        const sections = groupTasks(tasks, day, day, tz);
        const open = [...sections.agenda, ...sections.todo].filter((t) => t.status === "open").length;
        if (open > 0) {
          out.push({
            key: `digest:evening:${day}`,
            targetType: "digest",
            targetId: null,
            fireAt,
            title: "Revisione della sera",
            body: eveningHeading(input.name, open),
            url: "/today"
          });
        }
      }
    }
  }
  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}
export {
  afterQuietHours,
  inQuietHours,
  planReminders
};
