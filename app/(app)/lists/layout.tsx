import type { ReactNode } from "react";
import { SegmentedNav } from "@/components/ui/segmented-nav";

export default function ListsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-5 md:px-10 md:py-7">
      <SegmentedNav
        label="Liste"
        items={[
          { href: "/lists/shopping", label: "Spesa" },
          { href: "/lists/meals", label: "Pasti" },
          { href: "/lists/wishlist", label: "Acquisti" },
          { href: "/lists/wardrobe", label: "Guardaroba" },
        ]}
      />
      {children}
    </div>
  );
}
