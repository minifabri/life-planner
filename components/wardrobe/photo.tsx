"use client";

import { CategoryIcon } from "@/components/wardrobe/category-icon";
import { useWardrobeImageUrl } from "@/lib/data/wardrobe-hooks";
import type { WardrobeItem } from "@/lib/supabase/types";

/** Foto di un capo: quella propria (Storage, URL firmato), poi quella esterna, poi l'icona della categoria. */
export function WardrobePhoto({ item }: { item: Pick<WardrobeItem, "thumb_path" | "image_url" | "category"> }) {
  const signed = useWardrobeImageUrl(item.thumb_path);
  const src = item.thumb_path ? signed.data : item.image_url;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" className="size-full rounded-[10px] object-cover" />;
  }
  return (
    <span className="flex size-full items-center justify-center text-text-3">
      <CategoryIcon category={item.category} />
    </span>
  );
}
