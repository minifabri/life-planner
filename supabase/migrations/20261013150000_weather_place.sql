-- Incremento 28 — Guardaroba: città per il meteo, scelta nelle impostazioni.
-- Solo colonne aggiunte al profilo: nome da mostrare e coordinate per chiedere la previsione.
alter table public.profiles
  add column weather_city text,
  add column weather_lat double precision,
  add column weather_lon double precision,
  add constraint profiles_weather_place_complete check (
    (weather_city is null and weather_lat is null and weather_lon is null)
    or (weather_city is not null and weather_lat between -90 and 90 and weather_lon between -180 and 180)
  );
