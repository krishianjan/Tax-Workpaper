"use client";

// Triggers the browser print dialog; the record's print CSS produces the PDF.
export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="rounded border border-slate-300 px-2 py-1">
      Print / PDF
    </button>
  );
}
