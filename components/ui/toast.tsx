"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Toast = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "neutral" | "warn";
};

const ToastContext = createContext<(toast: Toast) => void>(() => {});

/** Durata del toast: il tempo utile per annullare (Product Definition 3.2). */
const TOAST_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(Toast & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((t: Toast) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ ...t, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6"
      >
        {toast ? (
          <div
            key={toast.id}
            className="pointer-events-auto flex min-h-11 max-w-md items-center gap-2 rounded-xl border border-line-2 bg-surface-2 pl-4 pr-1.5 text-sm shadow-lg"
          >
            <span className={toast.tone === "warn" ? "py-2 text-gold" : "py-2"}>{toast.message}</span>
            {toast.actionLabel ? (
              <button
                type="button"
                className="min-h-11 rounded-lg px-3 font-medium text-accent"
                onClick={() => {
                  toast.onAction?.();
                  setToast(null);
                }}
              >
                {toast.actionLabel}
              </button>
            ) : (
              <span className="w-2.5" />
            )}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
