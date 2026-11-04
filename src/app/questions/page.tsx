import { prisma } from "@/lib/db";
import { SectionTitle } from "@/components/ui";
import { askQuestion, answerQuestion, acceptQuestion } from "@/app/people-actions";

const Q_STYLE: Record<string, string> = { open: "bg-sky-100 text-sky-800", answered: "bg-amber-100 text-amber-800", accepted: "bg-emerald-100 text-emerald-800", rejected: "bg-red-100 text-red-800", withdrawn: "bg-slate-200 text-slate-700" };

export default async function QuestionsPage() {
  const session = await (await import("@/lib/session")).getSession();
  let questions: Array<{ id: string; fromId: string; toId: string; targetKind: string; targetId: string; text: string; status: string; blocksFiling: boolean }> = [];
  try {
    questions = await prisma.question.findMany({ where: { workspaceId: session.workspaceId }, orderBy: { createdAt: "desc" } });
  } catch {
    /* ignore */
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Questions</h1>
      <p className="text-sm text-slate-500">
        An answer is stored as an attachment and auto-linked as evidence to its target. Accepting it does not by itself
        resolve the issue. A blocking question keeps the filing gate red until accepted or withdrawn.
      </p>

      <SectionTitle>Open &amp; recent</SectionTitle>
      <div className="space-y-2">
        {questions.length === 0 ? <p className="text-sm text-slate-500">No questions yet — ask one below.</p> : null}
        {questions.map((q) => (
          <div key={q.id} className="card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`chip ${Q_STYLE[q.status]}`}>{q.status}</span>
              {q.blocksFiling ? <span className="chip bg-red-50 text-red-700">blocks filing</span> : null}
              <span className="text-slate-500">{q.fromId} → {q.toId} · about {q.targetKind}:{q.targetId}</span>
            </div>
            <p className="mt-1">{q.text}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {q.status === "open" ? (
                <form action={answerQuestion} className="flex gap-1">
                  <input type="hidden" name="id" value={q.id} />
                  {q.toId.startsWith("cu-") ? <input type="hidden" name="asClient" value={q.toId} /> : null}
                  <input name="text" placeholder="answer…" className="rounded border border-slate-300 px-2 py-0.5 text-xs" required />
                  <button className="rounded border border-slate-300 px-2 py-0.5 text-xs">answer</button>
                </form>
              ) : null}
              {q.status === "answered" ? (
                <form action={acceptQuestion}><input type="hidden" name="id" value={q.id} /><button className="rounded border border-slate-300 px-2 py-0.5 text-xs">accept</button></form>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>Ask a question</SectionTitle>
      <form action={askQuestion} className="flex flex-wrap items-end gap-2 text-sm">
        <input name="toId" placeholder="to (cu-01 / st-02)" className="rounded border border-slate-300 px-2 py-1" required />
        <select name="targetKind" className="rounded border border-slate-300 px-2 py-1">{["issue", "decision", "line", "document"].map((k) => <option key={k}>{k}</option>)}</select>
        <input name="targetId" placeholder="target id" className="rounded border border-slate-300 px-2 py-1" required />
        <label className="flex items-center gap-1 text-xs">blocks filing<input type="checkbox" name="blocksFiling" value="true" /></label>
        <input name="text" placeholder="question…" className="flex-1 rounded border border-slate-300 px-2 py-1" required />
        <button className="rounded bg-slate-900 px-3 py-1 text-white">Ask</button>
      </form>
    </div>
  );
}
