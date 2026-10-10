"use client";

import { useOffline, useSyncState } from "@/lib/data/hooks";

/** Avviso discreto: compare solo senza rete o quando ci sono modifiche che non riescono a partire. */
export function SyncStatus() {
  const offline = useOffline();
  const { pending, stalled } = useSyncState();
  const waiting = pending > 0 && (offline || stalled);
  if (!offline && !waiting) return <div role="status" aria-live="polite" />;

  const count = pending === 1 ? "1 modifica in attesa" : `${pending} modifiche in attesa`;
  return (
    <div role="status" aria-live="polite" className="flex min-h-8 items-center justify-center gap-2 border-b border-line px-5 text-xs text-text-3">
      <span aria-hidden className="size-1.5 rounded-full bg-text-3" />
      {offline ? (waiting ? `Sei offline · ${count}` : "Sei offline") : `${count} · riprovo tra poco`}
    </div>
  );
}
