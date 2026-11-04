"use client";
import { useState, useEffect, useCallback } from "react";

const STEPS = [
  {
    num: 1,
    title: "Every number traces to its source",
    body: "Click any value to follow it back to the exact field on the exact document page. The workpaper proves the return is right — it does not ask you to trust it.",
  },
  {
    num: 2,
    title: "Documents → evidence",
    body: "The Documents index shows all 74 source documents. Open one to see what the pipeline extracted, how it was verified against the printed content, and everywhere the value was used in the return.",
  },
  {
    num: 3,
    title: "Checks find mistakes automatically",
    body: "27 checks compare the engine's numbers to a second source — 1099s vs reported income, broker totals vs Schedule D, FX rates for the right period. No tax law is re-implemented; the checks look for inconsistencies.",
  },
  {
    num: 4,
    title: "Issues and Decisions capture judgment",
    body: "Each failing check raises an Issue. When a CPA makes a call — repair vs improvement, which FX rate to use — it becomes a Decision: versioned, signed, and linked to its evidence.",
  },
  {
    num: 5,
    title: "Records tie out to the return",
    body: "17 CPA records (depreciation, sales detail, carryovers, and more) are generated from the effective data. Each ties out to the return line it summarises — a failed tie-out is itself a finding.",
  },
];

const STORAGE_KEY = "miraflores_tour_v1";

export function GuidedTour() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage blocked (private mode, etc.) — just don't show
    }
  }, []);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visible, dismiss]);

  if (!visible) return null;

  const cur = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      role="complementary"
      aria-label="Getting started — step by step tour"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white shadow-[0_-2px_12px_rgba(0,0,0,0.08)]"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-start gap-4 px-4 py-4 sm:flex-nowrap sm:px-6">
        {/* step badge */}
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-700 text-sm font-bold text-white"
          aria-hidden="true"
        >
          {cur.num}
        </div>

        {/* text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">{cur.title}</p>
          <p className="mt-0.5 text-sm text-slate-600">{cur.body}</p>
        </div>

        {/* controls */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-slate-400" aria-live="polite">
            {step + 1} / {STEPS.length}
          </span>
          {!isFirst && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none"
            >
              Back
            </button>
          )}
          {isLast ? (
            <button
              onClick={dismiss}
              className="rounded bg-sky-700 px-3 py-1 text-xs text-white hover:bg-sky-800 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none"
            >
              Done
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="rounded bg-sky-700 px-3 py-1 text-xs text-white hover:bg-sky-800 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none"
            >
              Next
            </button>
          )}
          <button
            onClick={dismiss}
            aria-label="Dismiss tour"
            className="ml-1 rounded px-1 text-lg leading-none text-slate-400 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* "don't show again" only on the first step */}
      {isFirst && (
        <div className="border-t border-slate-100 px-4 pb-2 pt-1.5 sm:px-6">
          <button
            onClick={dismiss}
            className="text-xs text-slate-400 underline hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none"
          >
            Don&apos;t show again
          </button>
        </div>
      )}
    </div>
  );
}
