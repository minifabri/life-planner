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
