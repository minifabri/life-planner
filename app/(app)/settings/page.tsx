"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";
import { PageHeader } from "@/components/ui/page-header";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";
import {
  checkPushSupport,
  currentSubscription,
  isIOS,
  isStandalone,
  scheduleTestNotification,
  subscribeToPush,
  type PushSupport,
} from "@/lib/push/subscribe";
import {
  forgetLock,
  hasLockCredential,
  platformAuthenticatorAvailable,
  registerLock,
  verifyLock,
} from "@/lib/lock/webauthn";

export default function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-5 md:px-10 md:py-7">
      <PageHeader eyebrow="Impostazioni" title="Preferenze" />
      <ThemeSection />
      <NotificationsSection />
      <LockSection />
      <DataSection />
      <AccountSection />
    </div>
  );
}

function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="label-mono">{title}</h2>
      <div className="flex flex-col gap-3 border-t border-line pt-4">{children}</div>
      {note ? <p className="text-xs leading-relaxed text-text-3">{note}</p> : null}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-4 text-sm">
      <span className="text-text-2">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function Button({ children, onClick, primary, disabled }: { children: ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 rounded-xl px-4 text-sm transition-colors disabled:opacity-40 ${
        primary ? "bg-accent-fill font-medium text-on-accent" : "border border-line-2 text-text hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

function Status({ text, tone = "neutral" }: { text: string | null; tone?: "neutral" | "ok" | "warn" }) {
  if (!text) return null;
  const color = tone === "ok" ? "text-accent" : tone === "warn" ? "text-gold" : "text-text-2";
  return (
    <p role="status" aria-live="polite" className={`text-sm ${color}`}>
      {text}
    </p>
  );
}

/* ---------------- Tema ---------------- */
function ThemeSection() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  function apply(t: Theme) {
    setTheme(t);
    applyTheme(t);
    getSupabase().from("profiles").update({ theme: t }).neq("theme", t).then(() => {});
  }
  return (
    <Section title="Aspetto">
      <div role="group" aria-label="Tema" className="flex gap-0.5 self-start rounded-xl border border-line bg-surface p-[3px]">
        {(["dark", "light"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={theme === t}
            onClick={() => apply(t)}
            className={`min-h-9 rounded-[9px] px-4 text-[13px] ${theme === t ? "bg-surface-2 text-text" : "text-text-2"}`}
          >
            {t === "dark" ? "Scuro" : "Chiaro"}
          </button>
        ))}
      </div>
    </Section>
  );
}

/* ---------------- Notifiche (spike S1) ---------------- */
function NotificationsSection() {
  const [support] = useState<PushSupport | null>(() => (typeof window === "undefined" ? null : checkPushSupport()));
  const [subscribed, setSubscribed] = useState(false);
  const [status, setStatus] = useState<{ text: string; tone: "neutral" | "ok" | "warn" } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    currentSubscription().then((s) => setSubscribed(!!s));
  }, []);

  async function enable() {
    setBusy(true);
    setStatus(null);
    try {
      await subscribeToPush();
      setSubscribed(true);
      setStatus({ text: "Notifiche attive su questo dispositivo.", tone: "ok" });
    } catch (e) {
      setStatus({ text: `Non è stato possibile attivarle: ${(e as Error).message}`, tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  async function test(delay: number) {
    setBusy(true);
    try {
      const at = await scheduleTestNotification(delay);
      setStatus({
        text: `Prova pianificata per le ${at.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}. Chiudi l'app e aspetta: arriva entro un minuto da quell'orario.`,
        tone: "neutral",
      });
    } catch (e) {
      setStatus({ text: `Errore: ${(e as Error).message}`, tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Notifiche"
      note="Su iPhone le notifiche funzionano solo con l'app aggiunta alla schermata Home e aperta da lì."
    >
      {support && !support.ok && support.reason === "ios-not-installed" ? (
        <div className="flex flex-col gap-2 rounded-[14px] bg-accent-soft p-4 text-sm leading-relaxed">
          <p>Per ricevere notifiche, installa l’app:</p>
          <ol className="list-decimal pl-5 text-text-2">
            <li>Tocca il pulsante Condividi di Safari.</li>
            <li>Scegli “Aggiungi alla schermata Home”.</li>
            <li>Apri Planner dall’icona e torna qui.</li>
          </ol>
        </div>
      ) : null}
      {support && !support.ok && support.reason === "denied" ? (
        <Status text="Le notifiche sono bloccate nelle impostazioni del dispositivo per questa app." tone="warn" />
      ) : null}
      {support && !support.ok && (support.reason === "no-sw" || support.reason === "no-push") ? (
        <Status text="Questo browser non supporta le notifiche push." tone="warn" />
      ) : null}

      <Row label="Stato" value={subscribed ? <span className="text-accent">Attive</span> : <span className="text-text-3">Non attive</span>} />
      <div className="flex flex-wrap gap-2">
        {!subscribed ? (
          <Button primary onClick={enable} disabled={busy || !support?.ok}>
            Attiva notifiche
          </Button>
        ) : (
          <>
            <Button onClick={() => test(60)} disabled={busy}>
              Prova tra 1 minuto
            </Button>
            <Button onClick={() => test(0)} disabled={busy}>
              Prova subito
            </Button>
          </>
        )}
      </div>
      <Status text={status?.text ?? null} tone={status?.tone} />
    </Section>
  );
}

/* ---------------- Blocco Log (spike S2) ---------------- */
function LockSection() {
  const { session } = useAuth();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [registered, setRegistered] = useState(() => typeof window !== "undefined" && hasLockCredential());
  const [status, setStatus] = useState<{ text: string; tone: "neutral" | "ok" | "warn" } | null>(null);

  useEffect(() => {
    platformAuthenticatorAvailable().then(setAvailable);
  }, []);

  async function register() {
    setStatus(null);
    try {
      await registerLock(session!.user.id, session!.user.email ?? "planner");
      setRegistered(true);
      setStatus({ text: "Face ID / Touch ID configurato. Ora prova lo sblocco.", tone: "ok" });
    } catch (e) {
      setStatus({ text: `Configurazione non riuscita: ${(e as Error).message}`, tone: "warn" });
    }
  }

  async function verify() {
    setStatus(null);
    try {
      const ok = await verifyLock();
      setStatus(ok ? { text: "Sblocco riuscito con verifica biometrica.", tone: "ok" } : { text: "Verifica non confermata.", tone: "warn" });
    } catch (e) {
      setStatus({ text: `Sblocco non riuscito: ${(e as Error).message}`, tone: "warn" });
    }
  }

  return (
    <Section
      title="Blocco del Log · test"
      note="Serve a proteggere l'apertura delle registrazioni sensibili. È una protezione dell'interfaccia, non cifratura. Su iPhone viene salvata una passkey nel portachiavi."
    >
      <Row
        label="Face ID / Touch ID"
        value={available === null ? "…" : available ? <span className="text-accent">Disponibile</span> : <span className="text-text-3">Non disponibile</span>}
      />
      <div className="flex flex-wrap gap-2">
        {!registered ? (
          <Button primary onClick={register} disabled={!available}>
            Configura
          </Button>
        ) : (
          <>
            <Button primary onClick={verify}>
              Prova lo sblocco
            </Button>
            <Button
              onClick={() => {
                forgetLock();
                setRegistered(false);
                setStatus(null);
              }}
            >
              Rimuovi
            </Button>
          </>
        )}
      </div>
      <Status text={status?.text ?? null} tone={status?.tone} />
    </Section>
  );
}

/* ---------------- Dati ---------------- */
function DataSection() {
  return (
    <Section title="Dati" note="Porta dentro eventi e promemoria da Google Calendar, Calendario Apple o Outlook con un file .ics.">
      <div>
        <Link
          href="/settings/import"
          className="inline-flex min-h-11 items-center rounded-xl border border-line-2 px-4 text-sm text-text transition-colors hover:bg-surface-2"
        >
          Importa da calendario
        </Link>
      </div>
    </Section>
  );
}

/* ---------------- Account e diagnostica (spike S4) ---------------- */
function AccountSection() {
  const { session } = useAuth();
  const router = useRouter();
  const [env] = useState<{ standalone: boolean; ios: boolean } | null>(() =>
    typeof window === "undefined" ? null : { standalone: isStandalone(), ios: isIOS() }
  );

  const expires = session?.expires_at ? new Date(session.expires_at * 1000) : null;

  return (
    <Section title="Account" note="Per il test del login: chiudi completamente l'app dal multitasking e riaprila. Devi ritrovarti dentro senza un nuovo codice.">
      <Row label="Email" value={session?.user.email ?? "—"} />
      <Row label="App installata" value={env ? (env.standalone ? "Sì" : "No, nel browser") : "…"} />
      <Row label="Accesso dal" value={session?.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).toLocaleString("it-IT") : "—"} />
      <Row label="Token rinnovato fino alle" value={expires ? expires.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "—"} />
      <div>
        <Button
          onClick={async () => {
            await getSupabase().auth.signOut();
            router.replace("/login");
          }}
        >
          Esci
        </Button>
      </div>
    </Section>
  );
}
