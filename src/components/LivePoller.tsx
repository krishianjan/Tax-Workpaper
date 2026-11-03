"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Polls /api/events?after=<latestSeq> every 5s. When new events arrive it shows
// a badge; clicking refreshes the server component. Opening the page does NOT
// move the seen cursor — only "Mark seen" does.
export default function LivePoller({ latestSeq }: { latestSeq: number }) {
  const [newCount, setNewCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/events?after=${latestSeq}`, { cache: "no-store" });
        const data = await res.json();
        if (!stop) setNewCount(Array.isArray(data.events) ? data.events.length : 0);
      } catch {
        /* ignore */
      }
    };
    const h = setInterval(tick, 5000);
    tick();
    return () => {
      stop = true;
      clearInterval(h);
    };
  }, [latestSeq]);

  if (newCount === 0) return <span className="chip bg-slate-100 text-slate-500">live · up to date</span>;
  return (
    <button onClick={() => router.refresh()} className="chip bg-emerald-100 text-emerald-800">
      {newCount} new — click to load
    </button>
  );
}
