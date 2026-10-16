"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";

type Step = "email" | "code";

export default function LoginPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session) router.replace("/today");
  }, [loading, session, router]);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        // Il link nell'email riporta qui; il codice nella stessa email resta valido.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setBusy(false);
    if (error) {
      setError(messageFor(error.message));
      return;
    }
    setStep("code");
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) {
      setError(messageFor(error.message));
      return;
    }
    router.replace("/today");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-10 px-5 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="flex flex-col gap-3">
        <span className="flex items-center gap-2.5">
          <span className="size-3.5 rounded-[4px] bg-accent-fill shadow-[0_0_0_3px_var(--accent-soft)]" />
          <span className="font-mono text-[13px] tracking-[0.08em]">planner</span>
        </span>
        <h1 className="text-[34px] font-light leading-tight tracking-[-0.02em]">
          {step === "email" ? "Ciao di nuovo." : "Controlla la posta."}
        </h1>
        <p className="text-[15px] leading-relaxed text-text-2">
          {step === "email"
            ? "Inserisci la tua email: ti mando un link e un codice per entrare."
            : `Ho scritto a ${email}. Apri il link, oppure scrivi qui il codice: sull’app installata su iPhone usa il codice.`}
        </p>
      </div>

      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-4">
          <label htmlFor="email" className="label-mono">
            Email
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-12 border-0 border-b border-line-2 bg-transparent pb-3 text-lg text-text caret-accent outline-none placeholder:text-text-3 focus:border-accent"
            placeholder="nome@esempio.it"
          />
          <button
            type="submit"
            disabled={busy || !email}
            className="mt-4 min-h-12 rounded-[14px] bg-accent-fill text-[15px] font-medium text-on-accent transition-opacity disabled:opacity-40"
          >
            {busy ? "Invio…" : "Inviami link e codice"}
          </button>
        </form>
      ) : (
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
            className="min-h-12 border-0 border-b border-line-2 bg-transparent pb-3 font-mono text-2xl tracking-[0.3em] text-text caret-accent outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy || code.length < 6}
            className="mt-4 min-h-12 rounded-[14px] bg-accent-fill text-[15px] font-medium text-on-accent transition-opacity disabled:opacity-40"
          >
            {busy ? "Verifica…" : "Entra"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className="min-h-11 text-sm text-text-2"
          >
            Usa un’altra email
          </button>
        </form>
      )}

      <p role="alert" aria-live="polite" className="min-h-5 text-sm text-gold">
        {error}
      </p>
    </main>
  );
}

function messageFor(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("rate") || m.includes("security purposes")) return "Troppi tentativi. Aspetta un minuto e riprova.";
  if (m.includes("expired") || m.includes("invalid")) return "Codice non valido o scaduto. Richiedine uno nuovo.";
  if (m.includes("signups not allowed") || m.includes("not allowed")) return "Questa email non è abilitata.";
  return "Qualcosa non ha funzionato. Riprova tra poco.";
}
