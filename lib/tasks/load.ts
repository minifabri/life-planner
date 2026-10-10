export type LoadLevel = "empty" | "light" | "medium" | "full";

/** Carico della giornata dalle durate di eventi e attività (minuti impegnati). */
export function dayLoad(durations: (number | null | undefined)[]): { minutes: number; level: LoadLevel; ratio: number } {
  const minutes = durations.reduce<number>((sum, d) => sum + (d && d > 0 ? d : 0), 0);
  const level: LoadLevel = minutes === 0 ? "empty" : minutes < 180 ? "light" : minutes < 360 ? "medium" : "full";
  return { minutes, level, ratio: Math.min(1, minutes / 480) };
}

export const LOAD_LABEL: Record<LoadLevel, string> = {
  empty: "Giornata libera",
  light: "Giornata leggera",
  medium: "Giornata media",
  full: "Giornata piena",
};

export type LoadItem = { startMin: number | null; minutes: number | null | undefined };
export type DayPart = "morning" | "afternoon" | "evening";

export const PART_LABEL: Record<DayPart, string> = {
  morning: "mattina piena",
  afternoon: "pomeriggio pieno",
  evening: "sera piena",
};

const PARTS: [DayPart, number, number][] = [
  ["morning", 0, 13 * 60],
  ["afternoon", 13 * 60, 18 * 60],
  ["evening", 18 * 60, 24 * 60],
];

/** Sotto le due ore nessuna parte della giornata è "piena". */
const PEAK_MIN = 120;

/**
 * Divide il carico in ciò che è già passato e ciò che resta (`nowMin` in minuti dalla mezzanotte)
 * e dice quale parte della giornata è la più piena. Ciò che non ha un orario conta tra ciò che resta.
 */
export function loadSplit(items: LoadItem[], nowMin: number): { past: number; rest: number; peak: DayPart | null } {
  let pastMin = 0;
  let total = 0;
  const byPart: Record<DayPart, number> = { morning: 0, afternoon: 0, evening: 0 };
  for (const item of items) {
    const minutes = item.minutes && item.minutes > 0 ? item.minutes : 0;
    if (!minutes) continue;
    total += minutes;
    if (item.startMin === null) continue;
    const end = item.startMin + minutes;
    pastMin += Math.max(0, Math.min(end, nowMin) - item.startMin);
    for (const [part, from, to] of PARTS) byPart[part] += Math.max(0, Math.min(end, to) - Math.max(item.startMin, from));
  }
  const ratio = Math.min(1, total / 480);
  const past = total ? ratio * (pastMin / total) : 0;
  const [first, second] = PARTS.map(([part]) => part).sort((a, b) => byPart[b] - byPart[a]);
  const peak = byPart[first] >= PEAK_MIN && byPart[first] > byPart[second] ? first : null;
  return { past, rest: ratio - past, peak };
}
