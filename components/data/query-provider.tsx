"use client";

import { useState, type ReactNode } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { CACHE_MAX_AGE, PERSISTED_QUERIES, queryClient } from "@/lib/data/query-client";
import { createPersister } from "@/lib/sync/persister";

/** Query con cache salvata sul dispositivo: all'apertura l'app mostra subito gli ultimi dati, anche senza rete. */
export function QueryProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [persister] = useState(() => createPersister(`queries:${userId}`));
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        buster: userId,
        dehydrateOptions: {
          // Conta avere dei dati, non l'esito dell'ultimo aggiornamento: senza rete un refetch fallisce,
          // ma i dati di prima restano validi e vanno conservati.
          shouldDehydrateQuery: (query) =>
            query.state.data !== undefined && PERSISTED_QUERIES.includes(String(query.queryKey[0])),
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
