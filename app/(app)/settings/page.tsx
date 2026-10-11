"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { sync } from "@/lib/sync/engine";
import { forgetCachedData } from "@/lib/sync/persister";
import { useAuth } from "@/components/auth/auth-provider";
import { Field, inputClass } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { useProfile } from "@/lib/data/hooks";
import { DEFAULT_EVENING_TIME } from "@/lib/today/overview";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";
import { useIcloudAccount } from "@/lib/icloud/hooks";
import { useImayogaAccount } from "@/lib/imayoga/hooks";
import { connectImayoga, disconnectImayoga, imayogaErrorMessage, syncImayoga } from "@/lib/imayoga/sync";
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
      <DaySection />
      <NotificationsSection />
      <LockSection />
      <CalendarsSection />
      <ImayogaSection />
      <WorkoutsSection />
      <TemplatesSection />
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

/* ---------------- Mattino e sera ---------------- */
function DaySection() {
  const profile = useProfile();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<{ name?: string; evening?: string }>({});
  const [status, setStatus] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const name = draft.name ?? profile?.display_name ?? "";
  const evening = draft.evening ?? profile?.evening_review_time?.slice(0, 5) ?? DEFAULT_EVENING_TIME;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const { error } = await getSupabase()
      .from("profiles")
      .update({ display_name: name.trim() || null, evening_review_time: evening })
      .eq("owner_id", profile!.owner_id);
    if (error) return setStatus({ text: "Non salvato: serve la connessione.", tone: "warn" });
    await qc.invalidateQueries({ queryKey: ["profile"] });
    setDraft({});
    setStatus({ text: "Salvato.", tone: "ok" });
  }

  return (
    <Section
      title="Mattino e sera"
      note="In cima a Oggi trovi la panoramica della giornata; dall'ora indicata, la revisione di ciò che è rimasto aperto. Chiuse, tornano il giorno dopo."
    >
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <Field label="Come ti chiamo" htmlFor="profile-name">
            <input
              id="profile-name"
              type="text"
              autoComplete="given-name"
              maxLength={40}
              value={name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Revisione della sera dalle" htmlFor="profile-evening">
            <input
              id="profile-evening"
              type="time"
              required
              value={evening}
              onChange={(e) => setDraft({ ...draft, evening: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={!profile}
          className="min-h-11 self-start rounded-xl border border-line-2 px-4 text-sm text-text transition-colors hover:bg-surface-2 disabled:opacity-40"
        >
          Salva
        </button>
      </form>
      <Status text={status?.text ?? null} tone={status?.tone} />
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

/* ---------------- Calendari ---------------- */
function CalendarsSection() {
  const { data: account } = useIcloudAccount();
  return (
    <Section title="Calendari" note="Gli eventi del calendario dell'iPhone compaiono qui da soli e si modificano dall'iPhone.">
      <Row
        label="Calendario iCloud"
        value={
          account ? (
            account.last_error ? (
              <span className="text-gold">Da ricollegare</span>
            ) : (
              <span className="text-accent">Collegato</span>
            )
          ) : (
            <span className="text-text-3">Non collegato</span>
          )
        }
      />
      <div>
        <Link
          href="/settings/icloud"
          className="inline-flex min-h-11 items-center rounded-xl border border-line-2 px-4 text-sm text-text transition-colors hover:bg-surface-2"
        >
          {account ? "Gestisci" : "Collega il calendario iCloud"}
        </Link>
      </div>
    </Section>
  );
}

/* ---------------- Lezioni da imayoga ---------------- */
function ImayogaSection() {
  const qc = useQueryClient();
  const account = useImayogaAccount();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);

  async function act(action: () => Promise<string | null>) {
    setBusy(true);
    setStatus(null);
    try {
      const text = await action();
      setStatus(text ? { text, tone: "ok" } : null);
    } catch (e) {
      setStatus({ text: imayogaErrorMessage(e), tone: "warn" });
    } finally {
      await Promise.all([qc.invalidateQueries({ queryKey: ["imayoga-account"] }), qc.invalidateQueries({ queryKey: ["events"] })]);
      setBusy(false);
    }
  }

  async function update() {
    const result = await syncImayoga();
    const changes = result ? result.updated + result.removed : 0;
    return changes === 0 ? "Tutto aggiornato." : changes === 1 ? "1 lezione aggiornata." : `${changes} lezioni aggiornate.`;
  }

  const connected = !!account.data;
  const lastSync = account.data?.last_synced_at
    ? new Date(account.data.last_synced_at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "Mai";

  return (
    <Section
      title="Lezioni imayoga"
      note="Le lezioni pubblicate su imayoga compaiono in Oggi come eventi di un'ora e si modificano in imayoga. Le bozze e gli slot individuali non prenotati restano fuori."
    >
      <Row
        label="Lezioni da imayoga"
        value={
          account.isPending ? (
            "…"
          ) : connected ? (
            account.data?.last_error ? (
              <span className="text-gold">Da riconfigurare</span>
            ) : (
              <span className="text-accent">Collegate</span>
            )
          ) : (
            <span className="text-text-3">Non collegate</span>
          )
        }
      />
      {connected ? <Row label="Ultimo aggiornamento" value={lastSync} /> : null}
      <div className="flex flex-wrap gap-2">
        {connected ? (
          <>
            <Button onClick={() => act(update)} disabled={busy}>
              {busy ? "Aggiorno…" : "Aggiorna ora"}
            </Button>
            <Button
              onClick={() =>
                act(async () => {
                  await disconnectImayoga();
                  return null;
                })
              }
              disabled={busy}
            >
              Scollega
            </Button>
          </>
        ) : (
          <Button
            onClick={() =>
              act(async () => {
                await connectImayoga();
                return update();
              })
            }
            disabled={busy || account.isPending}
          >
            {busy ? "Collego…" : "Collega le lezioni"}
          </Button>
        )}
      </div>
      <Status text={status?.text ?? null} tone={status?.tone} />
    </Section>
  );
}

/* ---------------- Allenamenti ---------------- */
function WorkoutsSection() {
  return (
    <Section title="Allenamenti" note="Si aggiungono da “Aggiungi” scegliendo Allenamento, o scrivendo ad esempio “corsa domani 45 min”. In Oggi compaiono quando la settimana ne ha almeno uno.">
      <div>
        <Link
          href="/workouts"
          className="inline-flex min-h-11 items-center rounded-xl border border-line-2 px-4 text-sm text-text transition-colors hover:bg-surface-2"
        >
          Storico e riepilogo
        </Link>
      </div>
    </Section>
  );
}

/* ---------------- Template ---------------- */
function TemplatesSection() {
  return (
    <Section title="Template" note="Gruppi di attività che tornano uguali, come la preparazione di una lezione: scegli il giorno di partenza e nascono tutte insieme.">
      <div>
        <Link
          href="/settings/templates"
          className="inline-flex min-h-11 items-center rounded-xl border border-line-2 px-4 text-sm text-text transition-colors hover:bg-surface-2"
        >
          Gestisci i template
        </Link>
      </div>
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
            // Prima si prova a inviare ciò che è in attesa; poi i dati salvati sul dispositivo si tolgono.
            await sync();
            await getSupabase().auth.signOut();
            await forgetCachedData();
            router.replace("/login");
          }}
        >
          Esci
        </Button>
      </div>
    </Section>
  );
}
