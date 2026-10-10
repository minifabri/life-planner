"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCapture } from "@/components/capture/capture-provider";

/** Indirizzo diretto al Quick Capture (segnalibri, Comandi rapidi di iOS): apre il foglio sopra Oggi. */
export default function CapturePage() {
  const router = useRouter();
  const capture = useCapture();
  useEffect(() => {
    capture();
    router.replace("/today");
  }, [capture, router]);
  return null;
}
