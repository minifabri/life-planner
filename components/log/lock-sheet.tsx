"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button, Field, inputClass } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { savePinHash } from "@/lib/data/log";
import { useLogUnlocked, usePinHash } from "@/lib/data/log-hooks";
import { hashPin, isValidPin, verifyPin } from "@/lib/lock/pin";
import { lockLog, pinWaitSeconds, recordPinAttempt, unlockLog } from "@/lib/lock/session";
import { forgetLock, hasLockCredential, platformAuthenticatorAvailable, registerLock, verifyLock } from "@/lib/lock/webauthn";

const NOTE = "Il blocco protegge ciò che si vede sullo schermo: non è una cifratura in più dei dati.";

function PinInput({ id, value, onChange, autoFocus }: { id: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <input
      id={id}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={6}
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      className={`${inputClass} font-mono tracking-[0.3em]`}
    />
  );
}

/** Sblocco, prima configurazione e gestione del blocco del Log (PIN, più Face ID / Touch ID su questo dispositivo). */
export function LockSheet({ onClose }: { onClose: () => void }) {
  const { session } = useAuth();
  const unlocked = useLogUnlocked();
  const pinQuery = usePinHash();
  const stored = pinQuery.data;

  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [wait, setWait] = useState(() => pinWaitSeconds());
  const [biometricsHere, setBiometricsHere] = useState(() => hasLockCredential());
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);

  useEffect(() => {
    platformAuthenticatorAvailable().then(setBiometricsAvailable);
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setInterval(() => setWait(pinWaitSeconds()), 1000);
    return () => clearInterval(id);
  }, [wait]);

  function reset() {
    setPin("");
    setConfirm("");
    setMessage(null);
  }

  async function saveNewPin(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidPin(pin)) return setMessage("Il PIN deve avere da 4 a 6 cifre.");
    if (pin !== confirm) return setMessage("I due PIN non coincidono.");
    setBusy(true);
    try {
      await savePinHash(await hashPin(pin));
      reset();
      setChanging(false);
      unlockLog();
      if (!stored) onClose();
    } catch {
      setMessage("Non è stato possibile salvare il PIN. Serve la connessione.");
    } finally {
      setBusy(false);
    }
  }

  async function unlockWithPin(e: React.FormEvent) {
    e.preventDefault();
    if (!stored || wait > 0) return;
    setBusy(true);
    const ok = await verifyPin(pin, stored);
    recordPinAttempt(ok);
    setBusy(false);
    if (ok) {
      unlockLog();
      onClose();
      return;
    }
    setPin("");
    const seconds = pinWaitSeconds();
    setWait(seconds);
    setMessage(seconds > 0 ? "PIN non corretto." : "PIN non corretto. Riprova.");
  }

  async function unlockWithBiometrics() {
    setMessage(null);
    try {
      if (await verifyLock()) {
        unlockLog();
        onClose();
      } else {
        setMessage("Verifica non confermata. Usa il PIN.");
      }
    } catch {
      setMessage("Sblocco non riuscito. Usa il PIN.");
    }
  }

  async function enableBiometrics() {
    setMessage(null);
    try {
      await registerLock(session!.user.id, session!.user.email ?? "planner");
      setBiometricsHere(true);
    } catch {
      setMessage("Configurazione non riuscita su questo dispositivo.");
    }
  }

  const title = unlocked ? "Blocco del Log" : stored ? "Sblocca il Log" : "Proteggi il Log";

  return (
    <Sheet title={title} isOpen onClose={onClose}>
      {pinQuery.isPending ? (
        <p className="text-sm text-text-3">Un momento…</p>
      ) : pinQuery.isError ? (
        <p role="alert" className="text-sm">
          Per sbloccare il Log serve la connessione.
        </p>
      ) : !stored || changing ? (
        <form onSubmit={saveNewPin} className="flex flex-col gap-4">
          <p className="text-sm text-text-2">
            {stored ? "Scegli il nuovo PIN." : "Le registrazioni riservate si aprono con un PIN di 4–6 cifre. Dopo potrai aggiungere Face ID o Touch ID su questo dispositivo."}
          </p>
          <div className="flex gap-3">
            <Field label="PIN" htmlFor="pin-new">
              <PinInput id="pin-new" value={pin} onChange={setPin} autoFocus />
            </Field>
            <Field label="Ripeti il PIN" htmlFor="pin-confirm">
              <PinInput id="pin-confirm" value={confirm} onChange={setConfirm} />
            </Field>
          </div>
          {message ? (
            <p role="alert" className="text-sm">
              {message}
            </p>
          ) : null}
          <p className="text-xs text-text-3">{NOTE}</p>
          <div className="flex justify-end gap-2">
            {changing ? (
              <Button
                variant="quiet"
                onClick={() => {
                  setChanging(false);
                  reset();
                }}
              >
                Annulla
              </Button>
            ) : null}
            <Button type="submit" variant="primary" disabled={busy || !pin || !confirm}>
              Salva il PIN
            </Button>
          </div>
        </form>
      ) : !unlocked ? (
        <div className="flex flex-col gap-4">
          {biometricsHere ? (
            <Button variant="primary" onClick={unlockWithBiometrics}>
              Sblocca con Face ID / Touch ID
            </Button>
          ) : null}
          <form onSubmit={unlockWithPin} className="flex flex-col gap-3">
            <Field label={biometricsHere ? "Oppure il PIN" : "PIN"} htmlFor="pin-unlock">
              <PinInput id="pin-unlock" value={pin} onChange={setPin} autoFocus={!biometricsHere} />
            </Field>
            <p role="status" aria-live="polite" className="min-h-5 text-sm">
              {wait > 0 ? `${message ?? ""} Riprova tra ${wait >= 60 ? `${Math.ceil(wait / 60)} min` : `${wait} s`}.`.trim() : message}
            </p>
            <div className="flex justify-end">
              <Button type="submit" variant={biometricsHere ? "secondary" : "primary"} disabled={busy || wait > 0 || !isValidPin(pin)}>
                Sblocca
              </Button>
            </div>
          </form>
          <p className="text-xs text-text-3">{NOTE}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-2">Il Log è sbloccato. Si richiude da solo dopo 5 minuti senza attività o se lasci l&apos;app in secondo piano.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                lockLog();
                onClose();
              }}
            >
              Blocca ora
            </Button>
            <Button
              onClick={() => {
                reset();
                setChanging(true);
              }}
            >
              Cambia PIN
            </Button>
            {biometricsHere ? (
              <Button
                onClick={() => {
                  forgetLock();
                  setBiometricsHere(false);
                }}
              >
                Togli Face ID / Touch ID da qui
              </Button>
            ) : biometricsAvailable ? (
              <Button onClick={enableBiometrics}>Usa Face ID / Touch ID qui</Button>
            ) : null}
          </div>
          {message ? (
            <p role="alert" className="text-sm">
              {message}
            </p>
          ) : null}
          <p className="text-xs text-text-3">{NOTE}</p>
        </div>
      )}
    </Sheet>
  );
}
