import { EmptyState, PageHeader } from "@/components/ui/page-header";

export default function WishlistPage() {
  return (
    <>
      <PageHeader eyebrow="Liste" title="Wishlist" />
      <EmptyState title="La wishlist arriva con l'incremento 8." hint="Prodotti da link, import da ChatGPT, livello di interesse." />
    </>
  );
}
