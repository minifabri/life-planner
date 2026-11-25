"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { authErrorMessage, normalizeEmail } from "@/lib/accounts/accounts";

/**
 * Accesso (technical-design.md 4.1, D76): email e password. Il codice via email serve al primo accesso,
 * alla password dimenticata (dopo il codice si sceglie la password) e a chi preferisce entrare così.
 * La registrazione è chiusa: gli account li aggiunge chi amministra, da Impostazioni › Account.
 */
type Step = "password" | "code" | "new-password";
type CodeFor = "reset" | "login";

const field =
  "min-h-12 border-0 border-b border-line-2 bg-transparent pb-3 text-lg text-text caret-accent outline-none placeholder:text-text-3 focus:border-accent";
const primary = "mt-4 min-h-12 rounded-[14px] bg-accent-fill text-[15px] font-medium text-on-accent transition-opacity disabled:opacity-40";
const quiet = "min-h-11 text-sm text-text-2 hover:text-text";

export default function LoginPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [step, setStep] = useState<Step>("password");
  const [codeFor, setCodeFor] = useState<CodeFor>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Chi arriva già con una sessione va in Oggi; chi entra qui con il codice per la password resta per sceglierla.
  const choosingPassword = useRef(false);

  useEffect(() => {
    if (!loading && session && !choosingPassword.current) router.replace("/today");
  }, [loading, session, router]);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().auth.signInWithPassword({ email: normalizeEmail(email), password });
    setBusy(false);
    if (error) return setError(authErrorMessage(error.message));
    router.replace("/today");
  }

  async function sendCode(reason: CodeFor) {
    if (!email.trim()) return setError("Scrivi prima la tua email.");
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().auth.signInWithOtp({
      email: normalizeEmail(email),
      // Registrazione chiusa: un'email che non ha un account non ne crea uno nuovo.
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) return setError(authErrorMessage(error.message));
    setCodeFor(reason);
    setCode("");
    setStep("code");
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (codeFor === "reset") choosingPassword.current = true;
    const { error } = await getSupabase().auth.verifyOtp({ email: normalizeEmail(email), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) {
      choosingPassword.current = false;
      return setError(authErrorMessage(error.message));
    }
    if (codeFor === "reset") setStep("new-password");
    else router.replace("/today");
  }

  const heading = step === "password" ? "Ciao di nuovo." : step === "code" ? "Controlla la posta." : "Scegli la password.";
  const intro =
    step === "password"
      ? "Entra con la tua email e la tua password. Al primo accesso ti mando un codice e scegli la password."
      : step === "code"
        ? `Ho scritto a ${normalizeEmail(email)}. Scrivi qui il codice: sull’app installata su iPhone usa il codice, non il link.`
        : "Ti servirà per entrare da ogni dispositivo. Potrai cambiarla da Impostazioni › Account.";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-10 px-5 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="flex flex-col gap-3">
        <span className="flex items-center gap-2.5">
          <span className="size-3.5 rounded-[4px] bg-accent-fill shadow-[0_0_0_3px_var(--accent-soft)]" />
          <span className="font-mono text-[13px] tracking-[0.08em]">planner</span>
        </span>
        <h1 className="text-[34px] font-light leading-tight tracking-[-0.02em]">{heading}</h1>
        <p className="text-[15px] leading-relaxed text-text-2">{intro}</p>
      </div>

      {step === "password" ? (
        <div className="flex flex-col gap-2">
          <form onSubmit={signIn} className="flex flex-col gap-4">
            <label htmlFor="email" className="label-mono">
              Email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
              placeholder="nome@esempio.it"
            />
            <label htmlFor="password" className="label-mono">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
            />
            <button type="submit" disabled={busy || !email || !password} className={primary}>
              {busy ? "Entro…" : "Entra"}
            </button>
          </form>
          <button type="button" onClick={() => sendCode("reset")} disabled={busy} className={`${quiet} mt-2`}>
            Primo accesso o password dimenticata?
          </button>
          <button type="button" onClick={() => sendCode("login")} disabled={busy} className={quiet}>
            Entra con un codice via email
          </button>
        </div>
      ) : step === "code" ? (
        <form onSubmit={verifyCode} className="flex flex-col gap-4">
          <label htmlFor="code" className="label-mono">
            Codice
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={10}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${field} font-mono text-2xl tracking-[0.3em]`}
          />
          <button type="submit" disabled={busy || code.length < 6} className={primary}>
            {busy ? "Verifica…" : codeFor === "reset" ? "Continua" : "Entra"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("password");
              setCode("");
              setError(null);
            }}
            className={quiet}
          >
            Torna indietro
          </button>
        </form>
      ) : (
        <NewPasswordForm
          submitLabel="Salva ed entra"
          onDone={() => {
            choosingPassword.current = false;
            router.replace("/today");
          }}
        />
      )}

      {step !== "new-password" ? (
        <p role="alert" aria-live="polite" className="min-h-5 text-sm text-gold">
          {error}
        </p>
      ) : null}
    </main>
  );
}
