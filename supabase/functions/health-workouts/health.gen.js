// File generato da scripts/build-functions.mjs a partire da lib/health/edge.ts. Non modificare a mano.

// lib/health/import.ts
var DEFAULT_TZ = "Europe/Rome";
var MAX_WORKOUTS = 200;
var DISCIPLINES = [
  ["Corsa", ["corsa", "run", "jogging"]],
  ["Camminata", ["camminata", "walk", "passeggiata"]],
  ["Escursione", ["escursion", "hik", "trekking"]],
  ["Bici", ["bici", "ciclismo", "cycl", "bike"]],
  ["Nuoto", ["nuoto", "swim"]],
  ["Yoga", ["yoga"]],
  ["Pilates", ["pilates"]],
  ["Hiit", ["hiit", "interval"]],
  ["Forza", ["forza", "strength", "pesi", "palestra", "weight"]]
];
function discipline(text) {
  const words = text.toLowerCase().split(/[^\p{L}]+/u);
  return DISCIPLINES.find(([, starts]) => words.some((w) => starts.some((s) => w.startsWith(s))))?.[0] ?? null;
}
function disciplineKey(text) {
  return (discipline(text) ?? text.trim().replace(/\s+/g, " ")).toLowerCase();
}
function activityName(type) {
  const name = discipline(type) ?? type.trim().replace(/\s+/g, " ");
  return name ? name[0].toUpperCase() + name.slice(1, 80) : "Allenamento";
}
function pick(raw, ...keys) {
  for (const key of keys) if (raw[key] !== void 0 && raw[key] !== null && raw[key] !== "") return raw[key];
  return void 0;
}
function measure(value) {
  if (typeof value === "number") return Number.isFinite(value) ? { n: value, unit: "", text: String(value) } : null;
  if (typeof value !== "string") return null;
  const match = value.match(/(\d+(?:[.,]\d+)?)\s*(\p{L}*)/u);
  if (!match) return null;
  return { n: Number(match[1].replace(",", ".")), unit: match[2].toLowerCase(), text: match[1] };
}
function positiveInt(n) {
  if (n === null || n === void 0 || !Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded > 0 && rounded < 1e7 ? rounded : null;
}
function durationMin(raw) {
  const value = pick(raw, "duration_min", "duration");
  if (typeof value === "string" && value.includes(":")) {
    const parts = value.split(":").map((p) => Number(p.trim().replace(",", ".")));
    if (parts.length > 3 || parts.some((p) => !Number.isFinite(p))) return null;
    const [s = 0, m = 0, h = 0] = parts.reverse();
    return h * 60 + m + s / 60;
  }
  return measure(value)?.n ?? null;
}
function distanceMeters(raw) {
  const meters = measure(pick(raw, "distance_m"));
  if (meters) return meters.n;
  const km = measure(pick(raw, "distance_km"));
  if (km) return km.n * 1e3;
  const distance = measure(pick(raw, "distance"));
  if (!distance) return null;
  if (distance.unit === "m" || distance.unit.startsWith("met")) return distance.n;
  if (distance.unit.startsWith("mi")) return distance.n * 1609.344;
  return distance.unit || distance.n < 200 ? distance.n * 1e3 : distance.n;
}
function energyKcal(raw) {
  const energy = measure(pick(raw, "energy_kcal", "energy", "calories"));
  if (!energy) return null;
  const n = /^\d{1,2}[.,]\d{3}$/.test(energy.text) ? Number(energy.text.replace(/[.,]/, "")) : energy.n;
  return energy.unit === "kj" ? n / 4.184 : n;
}
var WALL_CLOCK = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/;
function localParts(instant, tz) {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const part = Object.fromEntries(format.formatToParts(instant).map((p) => [p.type, p.value]));
  return { date: `${part.year}-${part.month}-${part.day}`, time: `${part.hour}:${part.minute}` };
}
function fromLocal(date, time, tz) {
  const wanted = Date.parse(`${date}T${time}:00Z`);
  let instant = wanted;
  for (let i = 0; i < 2; i++) {
    const shown = localParts(new Date(instant), tz);
    instant -= Date.parse(`${shown.date}T${shown.time}:00Z`) - wanted;
  }
  return new Date(instant);
}
function parseInstant(value, tz) {
  if (typeof value !== "string") return null;
  const wall = value.trim().match(WALL_CLOCK);
  if (wall) return { date: wall[1], time: wall[2], instant: fromLocal(wall[1], wall[2], tz) };
  const instant = new Date(value.trim());
  return Number.isNaN(instant.getTime()) ? null : { ...localParts(instant, tz), instant };
}
function toHealthWorkout(raw, tz) {
  const start = parseInstant(pick(raw, "start", "start_date"), tz);
  if (!start) return null;
  const end = parseInstant(pick(raw, "end", "end_date"), tz);
  const elapsed = end && end.instant > start.instant ? (end.instant.getTime() - start.instant.getTime()) / 6e4 : null;
  const duration = positiveInt(durationMin(raw) ?? elapsed);
  const type = String(pick(raw, "type", "activity", "name") ?? "");
  const id = String(pick(raw, "id") ?? "").trim();
  const finished = end && end.instant > start.instant ? end.instant : new Date(start.instant.getTime() + (duration ?? 0) * 6e4);
  return {
    // Senza identificativo di Salute, inizio e disciplina bastano a riconoscere lo stesso allenamento.
    health_id: id ? id.slice(0, 200) : `${start.date}T${start.time}|${disciplineKey(type) || "allenamento"}`,
    activity: activityName(type),
    date: start.date,
    time: start.time,
    ended_at: finished.toISOString(),
    duration_min: duration && duration <= 24 * 60 ? duration : null,
    distance_m: positiveInt(distanceMeters(raw)),
    energy_kcal: positiveInt(energyKcal(raw)),
    avg_hr: positiveInt(measure(pick(raw, "avg_hr", "heart_rate"))?.n)
  };
}
function validTimeZone(tz) {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
function parseHealthPayload(body, timezone = DEFAULT_TZ) {
  const tz = validTimeZone(timezone) ? timezone : DEFAULT_TZ;
  const list = Array.isArray(body) ? body : body?.workouts;
  if (!Array.isArray(list) || list.length > MAX_WORKOUTS) return null;
  const workouts = list.map((item) => item && typeof item === "object" ? toHealthWorkout(item, tz) : null);
  const valid = workouts.filter((w) => w !== null);
  return { workouts: valid, rejected: list.length - valid.length };
}
function minutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
function withoutNulls(patch) {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== null));
}
function planHealthImport(incoming, existing) {
  const seen = new Set(existing.map((w) => w.health_id).filter((id) => id !== null));
  const taken = /* @__PURE__ */ new Set();
  const plan = { complete: [], create: [], known: 0 };
  for (const w of [...incoming].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))) {
    if (seen.has(w.health_id)) {
      plan.known++;
      continue;
    }
    seen.add(w.health_id);
    const key = disciplineKey(w.activity);
    const gap = (e) => e.time ? Math.abs(minutes(e.time) - minutes(w.time)) : 24 * 60;
    const [match] = existing.filter((e) => !e.deleted_at && !e.health_id && !taken.has(e.id) && e.date === w.date && disciplineKey(e.activity) === key).sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || gap(a) - gap(b));
    const { ended_at, ...measured } = w;
    if (!match) {
      plan.create.push({ ...measured, status: "done", completed_at: ended_at, source: "health" });
      continue;
    }
    taken.add(match.id);
    plan.complete.push({
      id: match.id,
      // Il nome scelto nell'app resta; le misure di Salute si aggiungono solo dove ci sono.
      patch: withoutNulls({
        status: "done",
        health_id: w.health_id,
        completed_at: match.status === "done" ? null : ended_at,
        time: match.time ? null : w.time,
        duration_min: w.duration_min,
        distance_m: w.distance_m,
        energy_kcal: w.energy_kcal,
        avg_hr: w.avg_hr
      })
    });
  }
  return plan;
}
function importMessage(plan, rejected = 0) {
  const done = plan.complete.length;
  const added = plan.create.length;
  const parts = [
    done ? done === 1 ? "1 completato" : `${done} completati` : "",
    added ? added === 1 ? "1 aggiunto" : `${added} aggiunti` : "",
    rejected ? rejected === 1 ? "1 non letto" : `${rejected} non letti` : ""
  ].filter(Boolean);
  return parts.length ? `Allenamenti: ${parts.join(", ")}.` : "Nessun allenamento nuovo.";
}

// lib/health/token.ts
async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function looksLikeToken(token) {
  return /^lp_[A-Za-z0-9_-]{43}$/.test(token);
}
export {
  hashToken,
  importMessage,
  looksLikeToken,
  parseHealthPayload,
  planHealthImport
};
