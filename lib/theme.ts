export type Theme = "dark" | "light";

export function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("planner-theme", t);
  } catch {
    // storage non disponibile (es. navigazione privata): il tema vale solo per questa sessione
  }
}
