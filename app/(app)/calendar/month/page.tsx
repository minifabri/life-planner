import { EmptyState, PageHeader } from "@/components/ui/page-header";

export default function MonthPage() {
  return (
    <>
      <PageHeader eyebrow="Calendario" title="Mese" />
      <EmptyState title="La vista mensile arriva con l'incremento 6." hint="Qui vedrai eventi, scadenze e ricorrenze del mese." />
    </>
  );
}
