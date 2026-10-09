import { EmptyState, PageHeader } from "@/components/ui/page-header";

export default function MealsPage() {
  return (
    <>
      <PageHeader eyebrow="Liste" title="Pasti" />
      <EmptyState title="Il planner pasti arriva con l'incremento 5." hint="Colazione, pranzo, merenda e cena, con le preparazioni del giorno prima." />
    </>
  );
}
