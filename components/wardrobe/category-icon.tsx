import { Backpack, Footprints, Handbag, Shirt, Watch, type LucideIcon } from "lucide-react";
import type { WardrobeCategory } from "@/lib/supabase/types";

/** Icona di ripiego quando un capo non ha ancora una foto. */
const ICONS: Record<WardrobeCategory, LucideIcon> = {
  top: Shirt,
  bottom: Shirt,
  dress: Shirt,
  outerwear: Shirt,
  shoes: Footprints,
  accessory: Watch,
  bag: Handbag,
  other: Backpack,
};

export function CategoryIcon({ category, size = 26 }: { category: WardrobeCategory; size?: number }) {
  const Glyph = ICONS[category];
  return <Glyph size={size} strokeWidth={1.6} aria-hidden="true" focusable="false" />;
}
