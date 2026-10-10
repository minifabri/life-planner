"use client";

import { useRouter } from "next/navigation";
import { ItemEditor } from "@/components/today/item-editor";
import { useTaskActions, useTimezone, useToday } from "@/lib/data/hooks";

/**
 * Aggiunta di attività ed eventi con il modulo completo.
 * L'inserimento rapido in linguaggio naturale arriva con l'incremento 2.
 */
export default function CapturePage() {
  const router = useRouter();
  const tz = useTimezone();
  const { today } = useToday(tz);
  const actions = useTaskActions(today, tz);
  return (
    <ItemEditor
      target={{ kind: "new", day: today }}
      today={today}
      tz={tz}
      onClose={() => router.replace("/today")}
      onDeleteTask={actions.remove}
    />
  );
}
