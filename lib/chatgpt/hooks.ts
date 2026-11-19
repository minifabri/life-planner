"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchChatgptLink } from "./link";

export function useChatgptLink() {
  return useQuery({ queryKey: ["chatgpt-link"], queryFn: fetchChatgptLink, staleTime: 60_000 });
}
