import { describe, expect, it } from "vitest";
import { bandOf, cityName, forecastFor, forecastText, forecastUrl, geocodeUrl, parseForecast, parsePlaces, skyLabel, type DayForecast } from "./forecast";

function day(patch: Partial<DayForecast> = {}): DayForecast {
  return { date: "2026-10-12", min: 9, max: 16, feelsMin: 8, feelsMax: 15, rain: 10, code: 3, ...patch };
}

describe("indirizzi", () => {
  it("cerca la città in italiano, con il testo ripulito", () => {
    const url = new URL(geocodeUrl("  Reggio Emilia "));
    expect(url.host).toBe("geocoding-api.open-meteo.com");
    expect(url.searchParams.get("name")).toBe("Reggio Emilia");
    expect(url.searchParams.get("language")).toBe("it");
  });

  it("chiede 16 giorni nel fuso della città, con coordinate arrotondate", () => {
    const url = new URL(forecastUrl({ latitude: 45.46427, longitude: 9.18951 }));
    expect(url.host).toBe("api.open-meteo.com");
    expect(url.searchParams.get("latitude")).toBe("45.464");
    expect(url.searchParams.get("longitude")).toBe("9.190");
    expect(url.searchParams.get("forecast_days")).toBe("16");
    expect(url.searchParams.get("timezone")).toBe("auto");
  });
});

describe("parsePlaces", () => {
  it("compone il nome completo e salta le voci senza coordinate", () => {
    const places = parsePlaces({
      results: [
        { id: 3173435, name: "Milano", admin1: "Lombardia", country: "Italia", latitude: 45.46, longitude: 9.19 },
        { id: 1, name: "Monaco", admin1: "Monaco", country: "Monaco", latitude: 43.73, longitude: 7.42 },
        { id: 2, name: "Senza coordinate" },
      ],
    });
    expect(places).toEqual([
      { id: "3173435", name: "Milano, Lombardia, Italia", latitude: 45.46, longitude: 9.19 },
      { id: "1", name: "Monaco", latitude: 43.73, longitude: 7.42 },
    ]);
    expect(cityName(places[0])).toBe("Milano");
  });

  it("nessun risultato o risposta inattesa: elenco vuoto", () => {
    expect(parsePlaces({ generationtime_ms: 0.4 })).toEqual([]);
    expect(parsePlaces(null)).toEqual([]);
    expect(parsePlaces("errore")).toEqual([]);
  });
});

describe("parseForecast", () => {
  const json = {
    daily: {
      time: ["2026-10-12", "2026-10-13", "2026-10-14"],
      temperature_2m_max: [16.4, null, 18],
      temperature_2m_min: [9.2, 8, 10],
      apparent_temperature_max: [15.1, 12, null],
      apparent_temperature_min: [7.9, 6, null],
      precipitation_probability_max: [70, 20, null],
      weather_code: [61, 3, null],
    },
  };

  it("legge i giorni, salta quelli senza temperature e ripiega sull'aria se manca la percepita", () => {
    const days = parseForecast(json);
    expect(days.map((d) => d.date)).toEqual(["2026-10-12", "2026-10-14"]);
    expect(days[0]).toEqual({ date: "2026-10-12", min: 9.2, max: 16.4, feelsMin: 7.9, feelsMax: 15.1, rain: 70, code: 61 });
    expect(days[1]).toEqual({ date: "2026-10-14", min: 10, max: 18, feelsMin: 10, feelsMax: 18, rain: null, code: null });
  });

  it("risposta inattesa: nessun giorno", () => {
    expect(parseForecast({})).toEqual([]);
    expect(parseForecast({ daily: { time: "x" } })).toEqual([]);
    expect(parseForecast(undefined)).toEqual([]);
  });

  it("trova il giorno chiesto, o niente fuori dalla previsione", () => {
    const days = parseForecast(json);
    expect(forecastFor(days, "2026-10-14")?.max).toBe(18);
    expect(forecastFor(days, "2026-11-20")).toBeNull();
    expect(forecastFor(null, "2026-10-12")).toBeNull();
  });
});

describe("bandOf", () => {
  it("usa la percepita, pesando di più le ore calde", () => {
    expect(bandOf(day({ feelsMin: 2, feelsMax: 10 }))).toBe("cold");
    expect(bandOf(day({ feelsMin: 5, feelsMax: 16 }))).toBe("mild");
    expect(bandOf(day({ feelsMin: 14, feelsMax: 26 }))).toBe("warm");
    expect(bandOf(day({ feelsMin: 20, feelsMax: 31 }))).toBe("warm");
  });

  it("i confini: sotto 12 freddo, da 22 caldo", () => {
    expect(bandOf(day({ feelsMin: 11.9, feelsMax: 11.9 }))).toBe("cold");
    expect(bandOf(day({ feelsMin: 12, feelsMax: 12 }))).toBe("mild");
    expect(bandOf(day({ feelsMin: 22, feelsMax: 22 }))).toBe("warm");
  });
});

describe("testo", () => {
  it("temperature, cielo e pioggia probabile", () => {
    expect(forecastText(day({ rain: 70 }))).toBe("9–16°, coperto, pioggia probabile");
    expect(forecastText(day({ rain: 49 }))).toBe("9–16°, coperto");
    expect(forecastText(day({ code: null, rain: null }))).toBe("9–16°");
  });

  it("non ripete la pioggia se il cielo la dice già, e arrotonda senza -0", () => {
    expect(forecastText(day({ code: 63, rain: 90 }))).toBe("9–16°, pioggia");
    expect(forecastText(day({ min: -0.4, max: 3.6, code: 71, rain: 80 }))).toBe("0–4°, neve");
    expect(forecastText(day({ min: -3.5, max: 2, code: 0, rain: 0 }))).toBe("-3–2°, sereno");
  });

  it("riconosce i codici principali e tace sugli altri", () => {
    expect(skyLabel(1)).toBe("poco nuvoloso");
    expect(skyLabel(45)).toBe("nebbia");
    expect(skyLabel(53)).toBe("pioviggine");
    expect(skyLabel(81)).toBe("pioggia");
    expect(skyLabel(86)).toBe("neve");
    expect(skyLabel(96)).toBe("temporale");
    expect(skyLabel(10)).toBeNull();
    expect(skyLabel(null)).toBeNull();
  });
});
