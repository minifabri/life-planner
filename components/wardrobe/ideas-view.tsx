"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Segmented } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/page-header";
import { WardrobePhoto } from "@/components/wardrobe/photo";
import type { LocalDate } from "@/lib/dates/local";
import { CATEGORY_LABEL, OCCASION_OPTIONS } from "@/lib/wardrobe/categories";
import { suggestAround, suggestDiscover, suggestOutfits, type Band, type Suggestion, type SuggestData } from "@/lib/wardrobe/suggest";
import type { OutfitFeedback, WardrobeItem } from "@/lib/supabase/types";
import { BAND_LABEL, bandOf, forecastText, type DayForecast } from "@/lib/weather/forecast";

const PAGE = 3;

type Mode = "today" | "discover";
type BandChoice = Band | "auto";

const chip = (active: boolean) =>
  `flex min-h-11 shrink-0 items-center rounded-xl border px-3 text-[13px] capitalize transition-colors ${
    active ? "border-line-2 bg-surface-2 text-text" : "border-line text-text-2 hover:text-text"
  }`;

function IdeaCard({
  suggestion,
  verdict,
  onFeedback,
  onSave,
  onPlan,
  onWear,
}: {
  suggestion: Suggestion;
  verdict: OutfitFeedback["verdict"] | null;
  onFeedback: (verdict: OutfitFeedback["verdict"] | null) => void;
  onSave: () => void;
  onPlan: () => void;
  onWear: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3">
      {suggestion.label ? <span className="label-mono">{suggestion.label}</span> : null}
      <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {suggestion.items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1">
            <span className="relative aspect-square overflow-hidden rounded-[10px] bg-surface-2">
              <WardrobePhoto item={item} />
            </span>
            <span className="line-clamp-1 text-[11px] text-text-2">{item.name ?? CATEGORY_LABEL[item.category]}</span>
          </li>
        ))}
      </ul>
      {suggestion.reason ? <p className="text-sm text-text">{suggestion.reason}</p> : null}
      {suggestion.notes.length > 0 ? <p className="text-xs text-text-3">{suggestion.notes.join(" ")}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={verdict === "like"} onClick={() => onFeedback(verdict === "like" ? null : "like")} className={chip(verdict === "like")}>
          Mi piace
        </button>
        <button type="button" onClick={() => onFeedback("dislike")} className={chip(false)}>
          Non mi piace
        </button>
        <Button onClick={onSave}>Salva</Button>
        <Button onClick={onPlan}>Pianifica</Button>
        <Button onClick={onWear}>Indossato oggi</Button>
      </div>
    </li>
  );
}

/** Suggerimenti di abbinamento: regole locali sul guardaroba, sullo storico e sul profilo di stile. */
export function IdeasView({
  data,
  today,
  city,
  forecast,
  anchor,
  onClearAnchor,
  onFeedback,
  onSave,
  onPlan,
  onWear,
  onEditStyle,
}: {
  data: SuggestData;
  today: LocalDate;
  /** Città scelta nelle impostazioni, se c'è. */
  city: string | null;
  /** Previsione di oggi per quella città: "Che tempo fa" parte da qui invece che dalla stagione. */
  forecast: DayForecast | null;
  /** Il capo intorno a cui costruire (da "Abbina" nella scheda del capo), se c'è. */
  anchor: WardrobeItem | null;
  onClearAnchor: () => void;
  onFeedback: (suggestion: Suggestion, verdict: OutfitFeedback["verdict"] | null) => void;
  onSave: (suggestion: Suggestion) => void;
  onPlan: (suggestion: Suggestion) => void;
  onWear: (suggestion: Suggestion) => void;
  onEditStyle: () => void;
}) {
  const [mode, setMode] = useState<Mode>("today");
  const [occasion, setOccasion] = useState<string | null>(null);
  const [band, setBand] = useState<BandChoice>("auto");
  const [page, setPage] = useState(0);

  // Senza una scelta a mano vale la previsione di oggi; se manca, la stagione.
  const ctxBand: Band | null = band !== "auto" ? band : forecast ? bandOf(forecast) : null;

  const suggestions = useMemo(() => {
    const ctx = { today, occasion, band: ctxBand };
    if (anchor) return suggestAround(data, ctx, anchor.id);
    return mode === "discover" ? suggestDiscover(data, ctx) : suggestOutfits(data, ctx);
  }, [data, today, occasion, ctxBand, anchor, mode]);

  const pages = Math.max(1, Math.ceil(suggestions.length / PAGE));
  const current = page % pages;
  const shown = anchor || mode === "discover" ? suggestions : suggestions.slice(current * PAGE, current * PAGE + PAGE);
  const verdictOf = (s: Suggestion) => data.feedback.find((f) => f.signature === s.signature)?.verdict ?? null;

  return (
    <>
      {anchor ? (
        <div className="flex items-center justify-between gap-3 rounded-[14px] border border-line-2 bg-surface-2 px-3 py-1 text-sm">
          <span className="line-clamp-1">Intorno a: {anchor.name ?? CATEGORY_LABEL[anchor.category]}</span>
          <Button variant="quiet" className="-mr-3 shrink-0" onClick={onClearAnchor}>
            Togli
          </Button>
        </div>
      ) : (
        <Segmented
          label="Tipo di idee"
          value={mode}
          options={[
            { value: "today", label: "Per oggi" },
            { value: "discover", label: "Scopri" },
          ]}
          onChange={(m) => {
            setMode(m);
            setPage(0);
          }}
        />
      )}

      <div role="group" aria-label="Occasione" className="-mx-5 flex gap-1.5 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
        {OCCASION_OPTIONS.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={occasion === o}
            onClick={() => {
              setOccasion(occasion === o ? null : o);
              setPage(0);
            }}
            className={chip(occasion === o)}
          >
            {o}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-text-2">Che tempo fa</span>
        <Segmented
          label="Che tempo fa"
          value={band}
          options={[
            { value: "auto", label: forecast ? "Meteo" : "Stagione" },
            { value: "cold", label: "Freddo" },
            { value: "mild", label: "Mite" },
            { value: "warm", label: "Caldo" },
          ]}
          onChange={(b) => {
            setBand(b);
            setPage(0);
          }}
        />
        {city && forecast ? (
          <p className="text-xs text-text-2">
            {city}, oggi: {forecastText(forecast)}. Conta come {BAND_LABEL[bandOf(forecast)]}.
          </p>
        ) : city ? (
          <p className="text-xs text-text-3">Previsione per {city} non disponibile ora: uso la stagione.</p>
        ) : (
          <Link href="/settings" className="-my-1 flex min-h-11 items-center self-start text-xs text-text-2 underline underline-offset-2 hover:text-text">
            Imposta la città per usare il meteo
          </Link>
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={mode === "discover" && !anchor ? "Nessun abbinamento nuovo da proporre." : "Non ho abbastanza capi per un'idea."}
          hint="Serve almeno un top con un pantalone o una gonna, oppure un vestito. Più dettagli hanno i capi, più le idee sono mirate."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((s) => (
            <IdeaCard key={s.signature} suggestion={s} verdict={verdictOf(s)} onFeedback={(v) => onFeedback(s, v)} onSave={() => onSave(s)} onPlan={() => onPlan(s)} onWear={() => onWear(s)} />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {!anchor && mode === "today" && pages > 1 ? <Button onClick={() => setPage((p) => p + 1)}>Altre idee</Button> : null}
        <Button variant="quiet" onClick={onEditStyle}>
          Il mio stile
        </Button>
      </div>
    </>
  );
}
