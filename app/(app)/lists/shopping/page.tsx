import { EmptyState, PageHeader } from "@/components/ui/page-header";

export default function ShoppingPage() {
  return (
    <>
      <PageHeader eyebrow="Liste" title="Spesa" />
      <EmptyState title="La lista della spesa arriva con l'incremento 4." hint="Suggerimenti dai tuoi acquisti, reparti appresi, funzionamento offline." />
    </>
  );
}
