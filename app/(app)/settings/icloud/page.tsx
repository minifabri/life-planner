"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Field, inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { useTimezone } from "@/lib/data/hooks";
import { useIcloudAccount, useIcloudCalendars } from "@/lib/icloud/hooks";
import {
  connectIcloud,
  disconnectIcloud,
  icloudErrorMessage,
  refreshIcloudCalendars,
  setIcloudCalendarSelected,
  syncIcloud,
} from "@/lib/icloud/sync";
import type { IcloudAccount, IcloudCalendar } from "@/lib/supabase/types";

type Status = { text: string; tone: "ok" | "warn" } | null;

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p role="status" aria-live="polite" className={`text-sm ${status.tone === "ok" ? "text-accent" : "text-gold"}`}>
      {status.text}
    </p>
  );
}

export default function IcloudPage() {
  const account = useIcloudAccount();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-5 md:px-10 md:py-7">
      <Link href="/settings" className="-ml-2 flex min-h-11 items-center self-start rounded-xl px-2 text-sm text-text-2 hover:text-text">
        ← Impostazioni
      </Link>
      <PageHeader eyebrow="Calendari" title="Calendario" muted="iCloud" />
      {account.isPending ? (
        <p className="text-sm text-text-3" aria-busy="true">
          Carico…
        </p>
      ) : account.isError ? (
        <p role="alert" className="text-sm text-gold">
          Non riesco a leggere lo stato del collegamento. Controlla la connessione e riprova.
        </p>
      ) : account.data ? (
        <Connected account={account.data} />
      ) : (
        <ConnectForm />
      )}
    </div>
  );
}

/* ---------------- Collegamento ---------------- */
function ConnectForm({ reconnect }: { reconnect?: boolean }) {
  const qc = useQueryClient();
  const [appleId, setAppleId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await connectIcloud(appleId, password);
      setPassword("");
      await refreshIcloudCalendars().catch(() => []);
      await qc.invalidateQueries({ queryKey: ["icloud-account"] });
      await qc.invalidateQueries({ queryKey: ["icloud-calendars"] });
    } catch (err) {
      setStatus({ text: icloudErrorMessage(err), tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-5">
      {!reconnect ? (
        <p className="text-sm leading-relaxed text-text-2">
          Gli eventi dei tuoi calendari iCloud compaiono in Oggi e nel Calendario e si aggiornano da soli. Si leggono
          soltanto: per modificarli usi il Calendario dell’iPhone.
        </p>
      ) : null}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Apple ID (email)" htmlFor="icloud-apple-id">
          <input
            id="icloud-apple-id"
            type="email"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={appleId}
            onChange={(e) => setAppleId(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Password specifica per le app" htmlFor="icloud-app-password">
          <input
            id="icloud-app-password"
            type="password"
            required
            autoComplete="off"
            placeholder="xxxx-xxxx-xxxx-xxxx"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div>
          <Button type="submit" variant="primary" disabled={busy || !appleId || !password}>
            {busy ? "Collego…" : reconnect ? "Ricollega" : "Collega"}
          </Button>
        </div>
        <StatusLine status={status} />
      </form>
      <div className="flex flex-col gap-3 border-t border-line pt-4 text-sm leading-relaxed text-text-2">
        <h2 className="label-mono">Come creare la password</h2>
        <ol className="list-decimal pl-5">
          <li>
            Apri <span className="text-text">account.apple.com</span> ed entra con il tuo Apple ID.
          </li>
          <li>
            Vai in <span className="text-text">Accesso e sicurezza → Password specifiche per le app</span>.
          </li>
          <li>Creane una nuova, chiamala “Planner” e copiala qui.</li>
        </ol>
        <p className="text-xs text-text-3">
          Non è la password del tuo account: vale solo per questa app, viene custodita cifrata sul server e puoi revocarla
          da Apple in qualsiasi momento. Serve l’autenticazione a due fattori attiva.
        </p>
      </div>
    </section>
  );
}

/* ---------------- Account collegato ---------------- */
function Connected({ account }: { account: IcloudAccount }) {
  const qc = useQueryClient();
  const tz = useTimezone();
  const calendars = useIcloudCalendars(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  function refresh() {
    return Promise.all([
      qc.invalidateQueries({ queryKey: ["icloud-account"] }),
      qc.invalidateQueries({ queryKey: ["icloud-calendars"] }),
      qc.invalidateQueries({ queryKey: ["events"] }),
    ]);
  }

  async function act(action: () => Promise<Status>) {
    setBusy(true);
    setStatus(null);
    try {
      setStatus(await action());
    } catch (err) {
      setStatus({ text: icloudErrorMessage(err), tone: "warn" });
    } finally {
      await refresh();
      setBusy(false);
    }
  }

  const sync = () =>
    act(async () => {
      const result = await syncIcloud(tz);
      if (!result) return null;
      const changes = result.updated + result.removed;
      return { text: changes === 0 ? "Tutto aggiornato." : changes === 1 ? "1 evento aggiornato." : `${changes} eventi aggiornati.`, tone: "ok" };
    });

  const toggle = (calendar: IcloudCalendar) =>
    act(async () => {
      await setIcloudCalendarSelected(calendar.id, !calendar.selected);
      if (!calendar.selected) await syncIcloud(tz);
      return null;
    });

  const reload = () =>
    act(async () => {
      await refreshIcloudCalendars();
      return null;
    });

  const disconnect = () =>
    act(async () => {
      await disconnectIcloud();
      return null;
    });

  const list = calendars.data ?? [];
  const lastSync = account.last_synced_at
    ? new Date(account.last_synced_at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "Mai";

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 border-t border-line pt-4 text-sm">
        <div className="flex min-h-9 items-center justify-between gap-4">
          <span className="text-text-2">Apple ID</span>
          <span className="break-all text-right">{account.apple_id}</span>
        </div>
        <div className="flex min-h-9 items-center justify-between gap-4">
          <span className="text-text-2">Ultimo aggiornamento</span>
          <span className="text-right">{lastSync}</span>
        </div>
      </div>

      {account.last_error ? (
        <div className="flex flex-col gap-4 rounded-[14px] bg-accent-soft p-4">
          <p className="text-sm leading-relaxed">
            iCloud non accetta più la password per app: forse è stata revocata. Creane una nuova e ricollega. Gli eventi già
            letti restano visibili.
          </p>
          <ConnectForm reconnect />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="label-mono">Calendari da seguire</h2>
        {calendars.isPending ? (
          <p className="text-sm text-text-3" aria-busy="true">
            Carico…
          </p>
        ) : list.length === 0 ? (
          <p className="text-sm text-text-2">Nessun calendario trovato. Tocca “Rileggi l’elenco”.</p>
        ) : (
          <ul className="flex flex-col">
            {list.map((calendar) => (
              <li key={calendar.id} className="border-b border-line last:border-b-0">
                <label className="flex min-h-11 cursor-pointer items-center gap-1 py-1.5">
                  <span className="-ml-2.5 flex size-11 shrink-0 items-center justify-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={calendar.selected}
                      disabled={busy}
                      onChange={() => toggle(calendar)}
                    />
                    <span
                      className={`flex size-[22px] items-center justify-center rounded-[7px] border transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:opacity-40 ${
                        calendar.selected ? "border-accent-fill bg-accent-fill text-on-accent" : "border-line-2 text-transparent"
                      }`}
                    >
                      <Icon name="check" size={14} />
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: calendar.color ?? "var(--text3)" }}
                  />
                  <span className="ml-2 min-w-0 break-words text-[15px] leading-snug">{calendar.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs leading-relaxed text-text-3">
          Scegli solo i calendari personali. Togliendo la spunta, gli eventi di quel calendario spariscono dall’app; su
          iCloud restano com’erano.
        </p>
      </div>

      <StatusLine status={status} />

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={sync} disabled={busy || !list.some((c) => c.selected)}>
          {busy ? "Aggiorno…" : "Aggiorna ora"}
        </Button>
        <Button onClick={reload} disabled={busy}>
          Rileggi l’elenco
        </Button>
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        {confirmDisconnect ? (
          <>
            <p className="text-sm leading-relaxed text-text-2">
              Scollegando, gli eventi iCloud spariscono dall’app e la password viene eliminata dal server. Su iCloud non
              cambia nulla.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={disconnect} disabled={busy}>
                Sì, scollega
              </Button>
              <Button variant="quiet" onClick={() => setConfirmDisconnect(false)} disabled={busy}>
                Annulla
              </Button>
            </div>
          </>
        ) : (
          <div>
            <Button variant="quiet" onClick={() => setConfirmDisconnect(true)} disabled={busy}>
              Scollega il calendario iCloud
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
