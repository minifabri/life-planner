"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { QuestionAnswer } from "../supabase/types";
import { ANSWERS_KEY, fetchAnswers } from "./questions";

export function useAnswers() {
  return useQuery({ queryKey: ANSWERS_KEY, queryFn: fetchAnswers });
}

/** Le chiavi delle domande a cui si è già risposto, su qualunque dispositivo; undefined finché non si sanno. */
export function useAnsweredKeys(): string[] | undefined {
  const data = useAnswers().data;
  return useMemo(() => data?.map((a) => a.key), [data]);
}

/** Le risposte come mappa chiave → risposta; undefined finché non si sanno. */
export function useAnswerMap(): Map<string, QuestionAnswer> | undefined {
  const data = useAnswers().data;
  return useMemo(
    () => (data ? new Map(data.map((a) => [a.key, a])) : undefined),
    [data],
  );
}

/** Esegue una volta, all'apertura, il trasloco sul server delle risposte salvate sul dispositivo. */
export function useImportOnce(run: () => Promise<void>) {
  useEffect(() => {
    void run().catch(() => {});
    // Solo all'apertura: `run` cambia a ogni render ma fa sempre la stessa cosa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
