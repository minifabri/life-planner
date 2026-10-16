import type { ReactNode } from "react";
import { SegmentedNav } from "@/components/ui/segmented-nav";

export default function CalendarLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 py-5 md:px-10 md:py-7">
      <SegmentedNav
        label="Vista calendario"
        tour="calendar-views"
        items={[
          { href: "/today", label: "Giorno" },
          { href: "/calendar/week", label: "Settimana" },
          { href: "/calendar/month", label: "Mese" },
        ]}
      />
      {children}
    </div>
  );
}
