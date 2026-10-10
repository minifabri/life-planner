"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { QueryProvider } from "@/components/data/query-provider";
import { SyncManager } from "@/components/data/sync-manager";
import { CaptureProvider } from "@/components/capture/capture-provider";
import { AppShell } from "@/components/shell/app-shell";
import { ToastProvider } from "@/components/ui/toast";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  if (loading || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-busy="true" aria-label="Caricamento">
        <span className="size-3.5 animate-pulse rounded-[4px] bg-accent-fill" />
      </div>
    );
  }

  return (
    <QueryProvider userId={session.user.id}>
      <ToastProvider>
        <SyncManager />
        <CaptureProvider>
          <AppShell>{children}</AppShell>
        </CaptureProvider>
      </ToastProvider>
    </QueryProvider>
  );
}
