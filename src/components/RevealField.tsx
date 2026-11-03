"use client";

import { useActionState } from "react";
import { revealSensitiveAction, type RevealState } from "@/app/firm-actions";

const initial: RevealState = { ok: false };

// 7.2 Reveal a masked sensitive value. The plaintext is shown for this response
// only (never cached); every reveal requires a reason and writes a ViewLog.
export function RevealField({ refId, mask }: { refId: string; mask: string }) {
  const [state, action, pending] = useActionState(revealSensitiveAction, initial);
  const revealed = state.ok && state.ref === refId ? state.value : null;

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="ref" value={refId} />
      <span className="mono">{revealed ?? mask}</span>
      <input name="reason" placeholder="reason" className="w-40 rounded border border-slate-300 px-2 py-0.5 text-xs" />
      <button className="rounded border border-slate-300 px-2 py-0.5 text-xs" disabled={pending}>
        {pending ? "…" : revealed ? "revealed" : "Reveal"}
      </button>
      {state.ref === refId && state.error ? <span className="text-xs text-red-700">{state.error}</span> : null}
    </form>
  );
}
