"use client";

import { useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { MIN_PASSWORD, authErrorMessage, passwordProblem } from "@/lib/accounts/accounts";

const field =
  "min-h-12 w-full border-0 border-b border-line-2 bg-transparent pb-3 text-lg text-text caret-accent outline-none placeholder:text-text-3 focus:border-accent";

/**
 * Sceglie o cambia la password di chi ha già fatto l'accesso (D76): dopo il codice del primo accesso
 * o della password dimenticata, e da Impostazioni › Account. La password resta solo a chi la sceglie.
 */
export function NewPasswordForm({ submitLabel, onDone, idPrefix = "new" }: { submitLabel: string; onDone: () => void; idPrefix?: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = passwordProblem(password, confirm);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(authErrorMessage(error.message));
    setPassword("");
    setConfirm("");
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <label htmlFor={`${idPrefix}-password`} className="label-mono">
        Nuova password
      </label>
      <input
        id={`${idPrefix}-password`}
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={field}
      />
      <label htmlFor={`${idPrefix}-confirm`} className="label-mono">
        Ripeti la password
      </label>
      <input
        id={`${idPrefix}-confirm`}
        type="password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className={field}
      />
      <p className="text-xs text-text-3">Almeno {MIN_PASSWORD} caratteri. Solo tu la conosci: nessuno, nemmeno chi gestisce l&apos;app, la vede.</p>
      <button
        type="submit"
        disabled={busy || password.length === 0 || confirm.length === 0}
        className="mt-2 min-h-12 rounded-[14px] bg-accent-fill text-[15px] font-medium text-on-accent transition-opacity disabled:opacity-40"
      >
        {busy ? "Salvo…" : submitLabel}
      </button>
      <p role="alert" aria-live="polite" className="min-h-5 text-sm text-gold">
        {error}
      </p>
    </form>
  );
}
