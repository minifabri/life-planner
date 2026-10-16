import type { ReactNode } from "react";

// 16 px su mobile: sotto questa soglia iOS ingrandisce la pagina al focus.
export const inputClass =
  "min-h-11 w-full min-w-0 rounded-xl border border-line-2 bg-bg px-3 text-base md:text-[15px] text-text placeholder:text-text-3 disabled:opacity-40";

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs text-text-2">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Scelta tra poche opzioni, con pulsanti reali (aria-pressed). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  tour,
}: {
  label: string;
  value: T;
  /** `tour`: valore di `data-tour` del pulsante, per il tour di sezione (D65). */
  options: { value: T; label: string; tour?: string }[];
  onChange: (value: T) => void;
  /** Valore di `data-tour` del gruppo. */
  tour?: string;
}) {
  return (
    <div role="group" aria-label={label} data-tour={tour} className="flex gap-0.5 rounded-xl border border-line bg-bg p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          data-tour={o.tour}
          className={`min-h-[38px] flex-1 rounded-[9px] px-2 text-[13px] transition-colors ${
            value === o.value ? "bg-surface-2 text-text" : "text-text-2 hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  type = "button",
  disabled,
  className = "",
  tour,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "quiet";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  /** Valore di `data-tour`, per il tour di sezione (D65). */
  tour?: string;
}) {
  const styles = {
    primary: "bg-accent-fill font-medium text-on-accent",
    secondary: "border border-line-2 text-text hover:bg-surface-2",
    quiet: "text-text-2 hover:bg-surface-2 hover:text-text",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-tour={tour}
      className={`min-h-11 rounded-xl px-4 text-sm transition-colors disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}
