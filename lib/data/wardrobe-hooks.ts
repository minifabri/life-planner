"use client";

import { useQuery } from "@tanstack/react-query";
import { WARDROBE_KEY, fetchWardrobeImageUrl, fetchWardrobeItems } from "./wardrobe";

export function useWardrobeItems() {
  return useQuery({ queryKey: WARDROBE_KEY, queryFn: fetchWardrobeItems });
}

/** URL firmato di una foto del guardaroba: si rinnova da solo prima che scada (ogni ora). */
export function useWardrobeImageUrl(path: string | null) {
  return useQuery({
    queryKey: ["wardrobe-image", path],
    queryFn: () => fetchWardrobeImageUrl(path!),
    enabled: !!path,
    staleTime: 50 * 60_000,
  });
}
