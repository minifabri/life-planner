"use client";

import { useQuery } from "@tanstack/react-query";
import { forecastUrl, geocodeUrl, parseForecast, parsePlaces, type DayForecast, type PlaceResult, type WeatherPlace } from "../weather/forecast";
import { useProfile } from "./hooks";

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
  return response.json();
}

/** Cerca una città per nome. A Open-Meteo arriva solo il testo cercato. */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  return parsePlaces(await getJson(geocodeUrl(query)));
}

export async function fetchForecast(place: WeatherPlace): Promise<DayForecast[]> {
  return parseForecast(await getJson(forecastUrl(place)));
}

/** La città del profilo, se è stata scelta. */
export function useWeatherPlace(): WeatherPlace | null {
  const profile = useProfile();
  if (!profile?.weather_city || profile.weather_lat === null || profile.weather_lon === null) return null;
  return { name: profile.weather_city, latitude: profile.weather_lat, longitude: profile.weather_lon };
}

/**
 * Previsione dei prossimi giorni per la città del profilo; `days` è `null` senza città o finché non arriva.
 * Resta sul dispositivo: senza rete si vede l'ultima scaricata, per i giorni che copre.
 */
export function useForecast(): { place: WeatherPlace | null; days: DayForecast[] | null } {
  const place = useWeatherPlace();
  const query = useQuery({
    queryKey: ["weather", place?.latitude, place?.longitude],
    queryFn: () => fetchForecast(place!),
    enabled: !!place,
    staleTime: 60 * 60_000,
  });
  return { place, days: place ? (query.data ?? null) : null };
}
