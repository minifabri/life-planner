"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchHealthLink } from "./link";

export function useHealthLink() {
  return useQuery({ queryKey: ["health-link"], queryFn: fetchHealthLink, staleTime: 60_000 });
}
