import type { LocalDate } from "../dates/local";
import type { Band } from "../wardrobe/suggest";

/**
 * Meteo: previsioni giornaliere di Open-Meteo (gratuito, senza chiave) per una città scelta nelle impostazioni.
 * Qui solo logica pura: indirizzi, lettura delle risposte, fascia di temperatura e testo da mostrare.
 */

/** La città salvata nel profilo. */
export type WeatherPlace = { name: string; latitude: number; longitude: number };

/** Un risultato della ricerca: `name` è già il testo completo da mostrare e salvare. */
export type PlaceResult = WeatherPlace & { id: string };

export type DayForecast = {
  date: LocalDate;
  /** Temperature dell'aria, in gradi. */
  min: number;
  max: number;
  /** Temperature percepite: da queste si ricava la fascia. */
  feelsMin: number;
  feelsMax: number;
  /** Probabilità massima di pioggia nel giorno (0–100), se nota. */
  rain: number | null;
  /** Codice WMO del tempo prevalente, se noto. */
  code: number | null;
};

/** Open-Meteo arriva fino a 16 giorni, oggi compreso. */
export const FORECAST_DAYS = 16;
const RAIN_LIKELY = 50;
const COLD_BELOW = 12;
const WARM_FROM = 22;

export function geocodeUrl(query: string): string {
  const params = new URLSearchParams({ name: query.trim(), count: "6", language: "it", format: "json" });
  return `https://geocoding-api.open-meteo.com/v1/search?${params}`;
}

export function forecastUrl(place: Pick<WeatherPlace, "latitude" | "longitude">): string {
  const params = new URLSearchParams({
    latitude: place.latitude.toFixed(3),
    longitude: place.longitude.toFixed(3),
    daily: "temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,weather_code",
    timezone: "auto",
    forecast_days: String(FORECAST_DAYS),
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Risultati della ricerca di una città: "Milano, Lombardia, Italia". Le voci incomplete si saltano. */
export function parsePlaces(json: unknown): PlaceResult[] {
  const results = record(json).results;
  if (!Array.isArray(results)) return [];
  const places: PlaceResult[] = [];
  for (const raw of results) {
    const r = record(raw);
    if (typeof r.name !== "string" || !isNumber(r.latitude) || !isNumber(r.longitude)) continue;
    const parts = [r.name, r.admin1, r.country].filter((p): p is string => typeof p === "string" && p.length > 0);
    places.push({
      id: String(r.id ?? `${r.latitude},${r.longitude}`),
      name: [...new Set(parts)].join(", "),
      latitude: r.latitude,
      longitude: r.longitude,
    });
  }
  return places;
}

/** I giorni della previsione. Un giorno senza temperature si salta; senza percepita si usa quella dell'aria. */
export function parseForecast(json: unknown): DayForecast[] {
  const daily = record(record(json).daily);
  const column = (key: string): unknown[] => (Array.isArray(daily[key]) ? (daily[key] as unknown[]) : []);
  const time = column("time");
  const max = column("temperature_2m_max");
  const min = column("temperature_2m_min");
  const feelsMax = column("apparent_temperature_max");
  const feelsMin = column("apparent_temperature_min");
  const rain = column("precipitation_probability_max");
  const code = column("weather_code");
  const days: DayForecast[] = [];
  time.forEach((date, i) => {
    const hi = max[i];
    const lo = min[i];
    if (typeof date !== "string" || !isNumber(hi) || !isNumber(lo)) return;
    const feelsHi = feelsMax[i];
    const feelsLo = feelsMin[i];
    const rainValue = rain[i];
    const codeValue = code[i];
    days.push({
      date,
      min: lo,
      max: hi,
      feelsMin: isNumber(feelsLo) ? feelsLo : lo,
      feelsMax: isNumber(feelsHi) ? feelsHi : hi,
      rain: isNumber(rainValue) ? rainValue : null,
      code: isNumber(codeValue) ? codeValue : null,
    });
  });
  return days;
}

/** "Milano" da "Milano, Lombardia, Italia". */
export function cityName(place: Pick<WeatherPlace, "name">): string {
  return place.name.split(",")[0].trim();
}

export function forecastFor(days: DayForecast[] | null | undefined, date: LocalDate): DayForecast | null {
  return days?.find((d) => d.date === date) ?? null;
}

/**
 * La fascia per vestirsi: conta la temperatura percepita, e le ore calde del giorno il doppio della minima
 * (che di solito cade di notte).
 */
export function bandOf(day: DayForecast): Band {
  const felt = (day.feelsMax * 2 + day.feelsMin) / 3;
  if (felt < COLD_BELOW) return "cold";
  return felt >= WARM_FROM ? "warm" : "mild";
}

export const BAND_LABEL: Record<Band, string> = { cold: "freddo", mild: "mite", warm: "caldo" };

/** Il tempo prevalente in una parola, dai codici WMO. */
export function skyLabel(code: number | null): string | null {
  if (code === null) return null;
  if (code === 0) return "sereno";
  if (code <= 2) return "poco nuvoloso";
  if (code === 3) return "coperto";
  if (code === 45 || code === 48) return "nebbia";
  if (code >= 51 && code <= 57) return "pioviggine";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "pioggia";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "neve";
  if (code >= 95) return "temporale";
  return null;
}

const WET = ["pioviggine", "pioggia", "neve", "temporale"];

function degrees(n: number): string {
  // Evita "-0".
  return String(Math.round(n) || 0);
}

/** "9–16°, coperto, pioggia probabile": ciò che serve per decidere cosa mettere. */
export function forecastText(day: DayForecast): string {
  const parts = [`${degrees(day.min)}–${degrees(day.max)}°`];
  const sky = skyLabel(day.code);
  if (sky) parts.push(sky);
  // Se il tempo prevalente è già bagnato, la probabilità non aggiunge nulla.
  if (day.rain !== null && day.rain >= RAIN_LIKELY && !(sky && WET.includes(sky))) parts.push("pioggia probabile");
  return parts.join(", ");
}
