import type { Attention } from "@/lib/supabase/types";

/** Rombo oro: attenzione alta e scadenze. */
export function Diamond({ label, size = 7, className = "" }: { label?: string; size?: number; className?: string }) {
  return (
    <span aria-hidden={label ? undefined : true} className={`shrink-0 rotate-45 bg-gold ${className}`} style={{ width: size, height: size }}>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

/** Segno dell'attenzione accanto a un elemento: rombo oro per l'alta, punto viola per la media, niente per la bassa. */
export function AttentionMark({ level, className = "" }: { level: Attention; className?: string }) {
  if (level === "high") return <Diamond label="Importante" className={className} />;
  if (level === "medium") {
    return (
      <span className={`size-1.5 shrink-0 rounded-full bg-accent ${className}`}>
        <span className="sr-only">Attenzione media</span>
      </span>
    );
  }
  return null;
}
