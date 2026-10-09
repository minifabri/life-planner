import { EmptyState, PageHeader } from "@/components/ui/page-header";

export default function WeekPage() {
  return (
    <>
      <PageHeader eyebrow="Calendario" title="Settimana" />
      <EmptyState title="La vista settimanale arriva con l'incremento 6." hint="Qui vedrai carico, appuntamenti, lezioni e spazi liberi." />
    </>
  );
}
