"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Field, inputClass } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage, canManage, isValidEmail, lastSignInLabel, normalizeEmail, type ManagedAccount } from "@/lib/accounts/accounts";
import { AdminError, addAccount, deleteManagedAccount, setAccountDisabled, useIsAdmin, useManagedAccounts } from "@/lib/data/accounts";

function messageOf(e: unknown): string {
  return adminErrorMessage(e instanceof AdminError ? e.code : "other");
}

/**
 * Impostazioni › Persone (D76): solo per chi amministra. Aggiunge un'email, disattiva e riattiva,
 * elimina con i dati. Le password non passano di qui: ognuno sceglie la sua al primo accesso.
 */
export function ManageAccountsSection() {
  const isAdmin = useIsAdmin();
  const accounts = useManagedAccounts(isAdmin);
  if (!isAdmin) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="label-mono">Persone</h2>
      <div className="flex flex-col gap-4 border-t border-line pt-4">
        <AddAccountForm />
        {accounts.isPending ? (
          <p className="text-sm text-text-2">Carico gli account…</p>
        ) : accounts.isError ? (
          <p className="text-sm text-gold">{messageOf(accounts.error)}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {accounts.data.map((a) => (
              <AccountRow key={a.id} account={a} />
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs leading-relaxed text-text-3">
        Chi aggiungi entra la prima volta da «Primo accesso o password dimenticata?» con un codice via email, e sceglie la sua password. Ogni account vede solo i propri dati.
        I dati però stanno nel tuo progetto Supabase: dalla dashboard tu potresti vederli. Dillo alle persone a cui dai l&apos;app.
      </p>
    </section>
  );
}

function AddAccountForm() {
  const qc = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) return setError(adminErrorMessage("invalid_email"));
    setBusy(true);
    setError(null);
    try {
      await addAccount(normalizeEmail(email));
      toast({ message: `${normalizeEmail(email)} può entrare.` });
      setEmail("");
      await qc.invalidateQueries({ queryKey: ["managed-accounts"] });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={add} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <Field label="Aggiungi una persona" htmlFor="add-account-email">
          <input
            id="add-account-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="nome@esempio.it"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Button type="submit" variant="primary" disabled={busy || !email.trim()}>
          {busy ? "Aggiungo…" : "Aggiungi"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-gold">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function AccountRow({ account }: { account: ManagedAccount }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const manageable = canManage(account);
  const matches = normalizeEmail(typed) === normalizeEmail(account.email);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["managed-accounts"] });
  }

  async function toggle(disabled: boolean, withUndo: boolean) {
    setBusy(true);
    setError(null);
    try {
      await setAccountDisabled(account.id, disabled);
      await refresh();
      if (withUndo) {
        toast({
          message: disabled ? `Account di ${account.email} disattivato.` : `Account di ${account.email} riattivato.`,
          actionLabel: "Annulla",
          onAction: () => void toggle(!disabled, false),
        });
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: FormEvent) {
    e.preventDefault();
    if (!matches) return;
    setBusy(true);
    setError(null);
    try {
      await deleteManagedAccount(account.id, normalizeEmail(typed));
      toast({ message: `Account di ${account.email} eliminato con tutti i suoi dati.` });
      await refresh();
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  const tag = account.self ? "Tu" : account.admin ? "Amministra" : account.disabled ? "Disattivato" : null;

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col">
          <span className={`break-all text-sm ${account.disabled ? "text-text-3" : "text-text"}`}>
            {account.email}
            {tag ? <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.06em] text-text-3">{tag}</span> : null}
          </span>
          <span className="text-xs text-text-3">{lastSignInLabel(account.last_sign_in_at)}</span>
        </div>
        {manageable && !confirming ? (
          <div className="flex gap-2">
            <Button onClick={() => void toggle(!account.disabled, true)} disabled={busy}>
              {account.disabled ? "Riattiva" : "Disattiva"}
            </Button>
            <Button variant="quiet" onClick={() => setConfirming(true)} disabled={busy}>
              Elimina…
            </Button>
          </div>
        ) : null}
      </div>
      {confirming ? (
        <form onSubmit={remove} className="flex flex-col gap-3 rounded-[14px] border border-line-2 p-4">
          <p className="text-sm leading-relaxed">
            Elimina l&apos;account e tutti i suoi dati: attività, eventi, Log, liste, foto del Guardaroba e collegamenti.{" "}
            <strong className="font-medium text-gold">Non si può annullare.</strong> Se vuoi solo togliere l&apos;accesso, usa Disattiva.
          </p>
          <Field label={`Per confermare scrivi l'email (${account.email})`} htmlFor={`delete-${account.id}`}>
            <input
              id={`delete-${account.id}`}
              type="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              onClick={() => {
                setConfirming(false);
                setTyped("");
                setError(null);
              }}
              disabled={busy}
            >
              Annulla
            </Button>
            <button
              type="submit"
              disabled={!matches || busy}
              className="min-h-11 rounded-xl border border-gold px-4 text-sm text-gold transition-colors hover:bg-surface-2 disabled:opacity-40"
            >
              {busy ? "Elimino…" : "Elimina per sempre"}
            </button>
          </div>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-gold">
          {error}
        </p>
      ) : null}
    </li>
  );
}
