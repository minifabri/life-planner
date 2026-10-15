"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Field, inputClass } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { useTimezone } from "@/lib/data/hooks";
import { parseFeedUrl } from "@/lib/gcal/feed";
import { useGcalCalendars } from "@/lib/gcal/hooks";
import { connectGcal, disconnectGcal, gcalErrorMessage, syncGcal } from "@/lib/gcal/sync";
import type { GcalCalendar } from "@/lib/supabase/types";

type Status = { text: string; tone: "ok" | "warn" } | null;

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p role="status" aria-live="polite" className={`text-sm ${status.tone === "ok" ? "text-accent" : "text-gold"}`}>
      {status.text}
    </p>
  );
}

function changesText(changes: number): string {
  return changes === 0 ? "Tutto aggiornato." : changes === 1 ? "1 evento aggiornato." : `${changes} eventi aggiornati.`;
}

export default function GooglePage() {
  const calendars = useGcalCalendars();
  const list = calendars.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-5 md:px-10 md:py-7">
      <Link href="/settings" className="-ml-2 flex min-h-11 items-center self-start rounded-xl px-2 text-sm text-text-2 hover:text-text">
        ← Impostazioni
      </Link>
      <PageHeader eyebrow="Calendari" title="Google" muted="Calendar" />
      {calendars.isPending ? (
        <p className="text-sm text-text-3" aria-busy="true">
          Carico…
        </p>
      ) : calendars.isError ? (
        <p role="alert" className="text-sm text-gold">
          Non riesco a leggere lo stato del collegamento. Controlla la connessione e riprova.
        </p>
      ) : (
        <>
          {list.length ? <Connected calendars={list} /> : null}
          <ConnectForm more={list.length > 0} />
        </>
      )}
    </div>
  );
}

/* ---------------- Collegamento ---------------- */
function ConnectForm({ more }: { more: boolean }) {
  const qc = useQueryClient();
  const tz = useTimezone();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!parseFeedUrl(url)) {
      setStatus({ text: "Questo non è un indirizzo segreto iCal di Google Calendar: deve finire con /basic.ics.", tone: "warn" });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await connectGcal(url);
      setUrl("");
      const result = await syncGcal(tz).catch(() => null);
      setStatus({ text: result ? `Collegato. ${changesText(result.updated)}` : "Collegato.", tone: "ok" });
    } catch (err) {
      setStatus({ text: gcalErrorMessage(err), tone: "warn" });
    } finally {
      await qc.invalidateQueries({ queryKey: ["gcal-calendars"] });
      await qc.invalidateQueries({ queryKey: ["events"] });
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-5">
      {more ? (
        <h2 className="label-mono">Aggiungi un altro calendario</h2>
      ) : (
        <p className="text-sm leading-relaxed text-text-2">
          Gli eventi del tuo calendario Google compaiono in Oggi e nel Calendario e si aggiornano da soli. Si leggono
          soltanto: per modificarli usi Google Calendar. Gli eventi che iniziano con 📦 diventano spedizioni e si vedono in
          piccolo, in cima alla giornata.
        </p>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Indirizzo segreto in formato iCal" htmlFor="gcal-url">
          <input
            id="gcal-url"
            type="url"
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div>
          <Button type="submit" variant={more ? "secondary" : "primary"} disabled={busy || !url.trim()}>
            {busy ? "Collego…" : "Collega"}
          </Button>
        </div>
        <StatusLine status={status} />
      </form>
      <div className="flex flex-col gap-3 border-t border-line pt-4 text-sm leading-relaxed text-text-2">
        <h2 className="label-mono">Dove trovare l’indirizzo</h2>
        <ol className="list-decimal pl-5">
          <li>
            Apri <span className="text-text">calendar.google.com</span> dal computer (l’app del telefono non lo mostra).
          </li>
          <li>
            In <span className="text-text">Impostazioni</span>, a sinistra, scegli il calendario sotto “Impostazioni dei miei
            calendari”.
          </li>
          <li>
            In <span className="text-text">Integra calendario</span> copia l’“Indirizzo segreto in formato iCal” e incollalo qui.
          </li>
        </ol>
        <p className="text-xs text-text-3">
          L’indirizzo vale come una password: viene custodito cifrato sul server. Se lo reimposti su Google, quello vecchio
          smette di funzionare e qui basta incollare il nuovo. Google aggiorna questo indirizzo con qualche ora di ritardo:
          un evento appena creato può comparire più tardi.
        </p>
      </div>
    </section>
  );
}

/* ---------------- Calendari collegati ---------------- */
function Connected({ calendars }: { calendars: GcalCalendar[] }) {
  const qc = useQueryClient();
  const tz = useTimezone();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function act(action: () => Promise<Status>) {
    setBusy(true);
    setStatus(null);
    try {
      setStatus(await action());
    } catch (err) {
      setStatus({ text: gcalErrorMessage(err), tone: "warn" });
    } finally {
      await qc.invalidateQueries({ queryKey: ["gcal-calendars"] });
      await qc.invalidateQueries({ queryKey: ["events"] });
      setBusy(false);
    }
  }

  const sync = () =>
    act(async () => {
      const result = await syncGcal(tz);
      return result ? { text: changesText(result.updated + result.removed), tone: "ok" } : null;
    });

  const disconnect = (calendar: GcalCalendar) =>
    act(async () => {
      await disconnectGcal(calendar.id);
      setConfirming(null);
      return null;
    });

  return (
    <section className="flex flex-col gap-4">
      <h2 className="label-mono">Calendari collegati</h2>
      <ul className="flex flex-col border-t border-line">
        {calendars.map((calendar) => {
          const lastSync = calendar.last_synced_at
            ? new Date(calendar.last_synced_at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
            : "mai";
          const name = calendar.summary || calendar.gcal_calendar_id;
          return (
            <li key={calendar.id} className="flex flex-col gap-2 border-b border-line py-3">
              <div className="flex min-h-11 items-center justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <span className="break-words text-[15px] leading-snug">{name}</span>
                  <span className="text-xs text-text-3">
                    {calendar.last_error ? (
                      <span className="text-gold">Indirizzo non più valido: incolla quello nuovo qui sotto</span>
                    ) : (
                      `Aggiornato: ${lastSync}`
                    )}
                  </span>
                </span>
                {confirming !== calendar.id ? (
                  <Button variant="quiet" onClick={() => setConfirming(calendar.id)} disabled={busy}>
                    Scollega
                  </Button>
                ) : null}
              </div>
              {confirming === calendar.id ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm leading-relaxed text-text-2">
                    Gli eventi di “{name}” spariscono dall’app e l’indirizzo viene eliminato dal server. Su Google non cambia
                    nulla.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => disconnect(calendar)} disabled={busy}>
                      Sì, scollega
                    </Button>
                    <Button variant="quiet" onClick={() => setConfirming(null)} disabled={busy}>
                      Annulla
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <StatusLine status={status} />
      <div>
        <Button variant="primary" onClick={sync} disabled={busy}>
          {busy ? "Aggiorno…" : "Aggiorna ora"}
        </Button>
      </div>
    </section>
  );
}
