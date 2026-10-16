import type { MicroTip } from "@/lib/meals/micros";

/** Cosa aggiungere ai pasti per i micronutrienti che mancano nel giorno. */
export function MicroTips({ tips }: { tips: MicroTip[] }) {
  if (tips.length === 0) return null;
  return (
    <section aria-label="Per completare il giorno" className="flex flex-col gap-1">
      <h3 className="label-mono">Per completare il giorno</h3>
      <ul className="flex flex-col gap-1">
        {tips.map((tip) => (
          <li key={tip.key} className="text-sm text-text-2">
            <span className="text-text">{tip.label}</span>: {tip.adds}.
          </li>
        ))}
      </ul>
    </section>
  );
}
