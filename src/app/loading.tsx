// Route-level loading UI (Next.js Suspense). Shown during server navigation so
// the app never flashes an empty frame.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span className="spinner" aria-hidden /> Loading…
      </div>
      <div className="h-6 w-48 rounded bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-slate-100" />
        ))}
      </div>
      <div className="h-40 rounded-lg bg-slate-100" />
    </div>
  );
}
