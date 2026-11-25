/** Di che telefono si tratta, dallo user agent: decide quali istruzioni di installazione mostrare. Puro. */
export type Platform = "ios" | "android" | "other";

export function detectPlatform(userAgent: string, platform = "", maxTouchPoints = 0): Platform {
  // iPadOS si presenta come un Mac: lo tradisce lo schermo touch.
  if (/iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}
