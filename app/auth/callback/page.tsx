"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * Arrivo dal magic link.
 * Il client Supabase legge i token dal frammento dell'URL (detectSessionInUrl);
 * qui aspettiamo la sessione e portiamo a Oggi, oppure mostriamo l'errore.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  // Letto solo nel browser (il server non vede il frammento dell'URL), senza differenze di idratazione.
  const linkError = useSyncExternalStore(noopSubscribe, readLinkError, () => null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (session) router.replace("/today");
  }, [session, router]);

  useEffect(() => {
    if (linkError || session) return;
    const t = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [linkError, session]);

  const failed = linkError || (!loading && !session && timedOut);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-5">
      {failed ? (
        <>
          <h1 className="text-[28px] font-light leading-tight tracking-[-0.02em]">Il link non ha funzionato.</h1>
          <p role="alert" className="text-[15px] leading-relaxed text-text-2">
            {linkError ?? "Non è stato possibile completare l’accesso."} Puoi richiederne uno nuovo, oppure usare il
            codice che trovi nella stessa email.
          </p>
          <Link
            href="/login"
            className="flex min-h-12 items-center justify-center rounded-[14px] bg-accent-fill text-[15px] font-medium text-on-accent"
          >
            Torna all’accesso
          </Link>
        </>
      ) : (
        <div className="flex items-center gap-3" aria-busy="true">
          <span className="size-3.5 animate-pulse rounded-[4px] bg-accent-fill" />
          <p className="text-[15px] text-text-2">Accesso in corso…</p>
        </div>
      )}
    </main>
  );
}

const noopSubscribe = () => () => {};

// Il client Supabase ripulisce l'URL dopo averlo letto: memorizziamo il primo valore.
let cachedLinkError: string | null | undefined;

function readLinkError(): string | null {
  if (cachedLinkError === undefined) cachedLinkError = parseLinkError();
  return cachedLinkError;
}

function parseLinkError(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
  const code = params.get("error_code") ?? params.get("error");
  if (!code) return null;
  if (code === "otp_expired") return "Il link è scaduto o è già stato usato.";
  return "Il link non è valido.";
}
