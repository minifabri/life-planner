"use client";

import { useQuery } from "@tanstack/react-query";
import { FEEDBACK_KEY, OUTFITS_KEY, PLANS_KEY, STYLE_KEY, WEARS_KEY, fetchFeedback, fetchOutfits, fetchPlans, fetchWardrobeStyle, fetchWears } from "./outfits";
import { WARDROBE_KEY, fetchWardrobeImageUrl, fetchWardrobeItems } from "./wardrobe";

export function useWardrobeItems() {
  return useQuery({ queryKey: WARDROBE_KEY, queryFn: fetchWardrobeItems });
}

export function useOutfits() {
  return useQuery({ queryKey: OUTFITS_KEY, queryFn: fetchOutfits });
}

export function useWears() {
  return useQuery({ queryKey: WEARS_KEY, queryFn: fetchWears });
}

export function useOutfitFeedback() {
  return useQuery({ queryKey: FEEDBACK_KEY, queryFn: fetchFeedback });
}

export function useOutfitPlans() {
  return useQuery({ queryKey: PLANS_KEY, queryFn: fetchPlans });
}

export function useWardrobeStyle() {
  return useQuery({ queryKey: STYLE_KEY, queryFn: fetchWardrobeStyle, staleTime: 5 * 60_000 });
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
