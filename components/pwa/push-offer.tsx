"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/form";
import { checkPushSupport, currentSubscription, subscribeToPush } from "@/lib/push/subscribe";

/** Sotto un promemoria acceso: se il dispositivo non riceve notifiche, propone di attivarle (il permesso si chiede da qui). */
export function PushOffer({ active }: { active: boolean }) {
  // null: non ancora noto, o già a posto.
  const [push, setPush] = useState<"off" | "unavailable" | "failed" | null>(null);

  useEffect(() => {
    if (!active) return;
    let stale = false;
    currentSubscription()
      .then((s) => {
        if (!stale) setPush(s ? null : checkPushSupport().ok ? "off" : "unavailable");
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [active]);

  if (!active) return null;
  if (push === "off") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-xs text-text-2">Su questo dispositivo le notifiche non sono attive.</p>
        <Button
          onClick={() =>
            subscribeToPush().then(
              () => setPush(null),
              () => setPush("failed"),
            )
          }
        >
          Attiva notifiche
        </Button>
      </div>
    );
  }
  if (push === "unavailable" || push === "failed") {
    return (
      <p className="text-xs text-text-2">
        Su questo dispositivo le notifiche non sono attive: guarda Impostazioni → Notifiche. Il promemoria arriva comunque sugli altri dispositivi dove sono attive.
      </p>
    );
  }
  return null;
}
