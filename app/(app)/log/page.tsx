import { EmptyState, PageHeader } from "@/components/ui/page-header";

export default function LogPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-5 md:px-10 md:py-7">
      <PageHeader eyebrow="Personal Log" title="Cronologia" />
      <EmptyState title="Il Personal Log arriva con l'incremento 7." hint="Le categorie predefinite sono già pronte nel database." />
    </div>
  );
}
