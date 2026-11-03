// 5.3 Review notes that can block filing. The assignee can only mark a note
// addressed; the author (or a higher review level) clears it. Any open blocking
// note turns the filing gate red.

export type NoteSeverity = "blocking" | "non_blocking";
export type NoteStatus = "open" | "addressed" | "cleared";

export interface ReviewNoteT {
  id: string;
  authorId: string;
  assigneeId: string | null;
  targetKind: string;
  targetId: string;
  severity: NoteSeverity;
  status: NoteStatus;
}

export type NoteAction = "address" | "clear" | "reopen";

export interface NoteTransition {
  ok: boolean;
  code?: 422;
  error?: string;
  next?: NoteStatus;
}

/** State validity (role/independence is handled by can()). */
export function noteTransition(note: ReviewNoteT, action: NoteAction): NoteTransition {
  switch (action) {
    case "address":
      if (note.status !== "open") return { ok: false, code: 422, error: `Cannot address a '${note.status}' note.` };
      return { ok: true, next: "addressed" };
    case "clear":
      if (note.status === "cleared") return { ok: false, code: 422, error: "Already cleared." };
      return { ok: true, next: "cleared" };
    case "reopen":
      if (note.status !== "cleared") return { ok: false, code: 422, error: "Only a cleared note can be reopened." };
      return { ok: true, next: "open" };
    default:
      return { ok: false, code: 422, error: "Unknown action." };
  }
}

/** Open blocking notes block filing (firm rule). */
export function openBlockingNotes(notes: ReviewNoteT[]): ReviewNoteT[] {
  return notes.filter((n) => n.severity === "blocking" && n.status !== "cleared");
}
