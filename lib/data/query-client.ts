import { QueryClient } from "@tanstack/react-query";

/** Quanto resta utilizzabile la cache salvata sul dispositivo. */
export const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * Un solo client per tutta l'app: lo usano i componenti e il livello dati,
 * che aggiorna la cache appena una modifica entra nella outbox.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Deve durare almeno quanto la cache salvata, altrimenti i dati spariscono prima di essere riletti.
      gcTime: CACHE_MAX_AGE,
      retry: 1,
    },
  },
});

/**
 * Le query salvate sul dispositivo. Del Log ci sono solo le registrazioni non riservate ("log-entries"):
 * quelle riservate ("log-private") restano in memoria e solo a Log sbloccato (technical-design.md, 6.2).
 */
export const PERSISTED_QUERIES = ["profile", "areas", "log-categories", "lists", "recurrences", "tasks", "events", "shopping-items", "pantry-items", "product-memory", "meals", "meal-memory", "log-entries", "wishlist-items", "workouts", "day-marks", "templates", "wardrobe-items", "outfits", "wardrobe-wears"];
