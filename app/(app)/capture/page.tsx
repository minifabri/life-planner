import { EmptyState, PageHeader } from "@/components/ui/page-header";

export default function CapturePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-5 md:px-10 md:py-7">
      <PageHeader eyebrow="Aggiungi" title="Quick Capture" />
      <EmptyState title="L'inserimento rapido arriva con l'incremento 2." hint="Scriverai in italiano e l'app riconoscerà tipo, data e ora." />
    </div>
  );
}
