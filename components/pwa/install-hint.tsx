"use client";

import { useState } from "react";
import { promptInstall, useCanInstall } from "@/lib/pwa/install";
import type { Platform } from "@/lib/pwa/platform";

/**
 * Come installare l'app sul telefono. iPhone: a mano da Safari (serve per le notifiche).
 * Android: con il pulsante di Chrome, se lo offre, altrimenti dal menu. Già installata o su desktop: niente.
 */
export function InstallHint({ platform, standalone }: { platform: Platform; standalone: boolean }) {
  const canInstall = useCanInstall();
  const [declined, setDeclined] = useState(false);
  if (standalone || platform === "other") return null;

  if (platform === "ios") {
    return (
      <div className="flex flex-col gap-2 rounded-[14px] bg-accent-soft p-4 text-sm leading-relaxed">
        <p>Per ricevere notifiche, installa l’app:</p>
        <ol className="list-decimal pl-5 text-text-2">
          <li>Apri questa pagina con Safari e tocca il pulsante Condividi.</li>
          <li>Scegli “Aggiungi alla schermata Home”.</li>
          <li>Apri Planner dall’icona e torna qui.</li>
        </ol>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-[14px] bg-accent-soft p-4 text-sm leading-relaxed">
      <p>Installa l’app: si apre a tutto schermo dalla sua icona, come le altre app del telefono.</p>
      {canInstall ? (
        <div>
          <button
            type="button"
            onClick={async () => setDeclined(!(await promptInstall()))}
            className="min-h-11 rounded-xl bg-accent-fill px-4 text-sm font-medium text-on-accent"
          >
            Installa l’app
          </button>
        </div>
      ) : (
        <ol className="list-decimal pl-5 text-text-2">
          <li>Apri questa pagina con Chrome e tocca il menu ⋮ in alto a destra.</li>
          <li>Scegli “Installa app” (o “Aggiungi a schermata Home”, poi “Installa”).</li>
          <li>Apri Planner dall’icona e torna qui.</li>
        </ol>
      )}
      {declined ? <p className="text-text-2">Va bene: puoi installarla quando vuoi da qui o dal menu ⋮ di Chrome.</p> : null}
      <p className="text-xs text-text-3">Con Samsung Internet: menu ☰ › “Aggiungi pagina a” › “Schermata Home”.</p>
    </div>
  );
}
