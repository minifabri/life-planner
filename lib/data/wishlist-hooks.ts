"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { awaitingMetadata } from "../wishlist/list";
import { useOffline } from "./hooks";
import { WISHLIST_KEY, fetchWishlistItems, refreshFromLink } from "./wishlist";

export function useWishlistItems() {
  return useQuery({ queryKey: WISHLIST_KEY, queryFn: fetchWishlistItems });
}

/**
 * Gli articoli salvati con un link ma senza dati (dal Quick Capture, o aggiunti senza rete)
 * vengono completati qui, uno alla volta, quando la wishlist è aperta e c'è connessione.
 */
export function useFetchPendingMetadata() {
  const items = useWishlistItems().data;
  const offline = useOffline();
  const tried = useRef(new Set<string>());
  const busy = useRef(false);

  useEffect(() => {
    if (offline || busy.current || !items) return;
    const next = awaitingMetadata(items).find((i) => !tried.current.has(i.id));
    if (!next) return;
    tried.current.add(next.id);
    busy.current = true;
    refreshFromLink(next)
      .catch(() => {
        // Senza rete o con il server irraggiungibile si riprova alla prossima apertura.
      })
      .finally(() => {
        busy.current = false;
      });
  }, [items, offline]);
}
