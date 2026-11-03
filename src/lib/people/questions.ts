// 5.2 Questions that become evidence. An answer (text + optional upload) is
// stored as an Attachment and auto-linked as evidence to the target. Accepting
// is a reviewer/preparer action and does NOT by itself resolve the Issue.

export type QuestionStatus = "open" | "answered" | "accepted" | "rejected" | "withdrawn";

export interface QuestionT {
  id: string;
  fromId: string;
  toId: string; // client user or staff
  targetKind: "issue" | "decision" | "line" | "document";
  targetId: string;
  text: string;
  dueAt: string | null;
  status: QuestionStatus;
  blocksFiling: boolean;
}

export interface QTransition {
  ok: boolean;
  code?: 422;
  error?: string;
  next?: QuestionStatus;
}

export function questionTransition(q: QuestionT, action: "answer" | "accept" | "reject" | "withdraw"): QTransition {
  switch (action) {
    case "answer":
      if (q.status !== "open") return { ok: false, code: 422, error: `Cannot answer a '${q.status}' question.` };
      return { ok: true, next: "answered" };
    case "accept":
      if (q.status !== "answered") return { ok: false, code: 422, error: "Only an answered question can be accepted." };
      return { ok: true, next: "accepted" };
    case "reject":
      if (q.status !== "answered") return { ok: false, code: 422, error: "Only an answered question can be rejected." };
      return { ok: true, next: "rejected" };
    case "withdraw":
      if (q.status === "accepted") return { ok: false, code: 422, error: "Cannot withdraw an accepted question." };
      return { ok: true, next: "withdrawn" };
    default:
      return { ok: false, code: 422, error: "Unknown action." };
  }
}

/** A blocking question blocks filing until accepted or withdrawn. */
export function openBlockingQuestions(questions: QuestionT[]): QuestionT[] {
  return questions.filter((q) => q.blocksFiling && q.status !== "accepted" && q.status !== "withdrawn");
}
