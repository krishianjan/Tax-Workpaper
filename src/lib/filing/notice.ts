import { createHash } from "node:crypto";

// 6.7 Answer a notice with a self-contained record. Examination items map to
// lines via a configurable table (no string matching in code). The response
// pack is built from the frozen filed snapshot and carries a manifest of every
// file with its sha256 and the snapshot hash — it must make sense without the app.

export interface NoticeItemMapping {
  lines: string[];
  documents: string[];
  adjustments?: string[];
}

// Configurable mapping: notice item index -> the lines/documents it questions.
export const L566_ITEM_MAP: NoticeItemMapping[] = [
  // Item 1: noncash charity (Schedule A line 12 / Form 8283)
  { lines: ["SchA.12", "F8283.A1.stock", "F8283.A1.vehicle"], documents: ["D65", "D66"], adjustments: ["subaru"] },
  // Item 2: Schedule C gross receipts vs 1099-NEC / 1099-K
  { lines: ["SchC.1"], documents: ["D14", "D15", "D16", "D17", "D18", "D19", "D20", "D21"], adjustments: ["k1099"] },
];

export interface MappedItem {
  index: number;
  text: string;
  mapping: NoticeItemMapping;
}

export function mapNoticeItems(items: string[], map: NoticeItemMapping[]): MappedItem[] {
  return items.map((text, index) => ({ index, text, mapping: map[index] ?? { lines: [], documents: [] } }));
}

export interface ManifestFile {
  name: string;
  sha256: string;
  bytes: number;
}

export interface ResponseManifest {
  snapshotHash: string;
  generatedAt: string;
  files: ManifestFile[];
}

/** Build a manifest from the files included in the response pack. Each file's
 *  content is hashed so the pack verifies without the app (trap 11). */
export function buildResponseManifest(files: Array<{ name: string; content: string }>, snapshotHash: string, now: string): ResponseManifest {
  return {
    snapshotHash,
    generatedAt: now,
    files: files.map((f) => ({
      name: f.name,
      sha256: createHash("sha256").update(f.content).digest("hex"),
      bytes: Buffer.byteLength(f.content, "utf8"),
    })),
  };
}

/** Every manifest file re-hashes to the recorded sha256 (verification). */
export function verifyManifest(manifest: ResponseManifest, files: Array<{ name: string; content: string }>): boolean {
  const byName = new Map(files.map((f) => [f.name, f.content]));
  return manifest.files.every((m) => {
    const content = byName.get(m.name);
    return content !== undefined && createHash("sha256").update(content).digest("hex") === m.sha256;
  });
}

const SEVEN_YEARS_MS = 7 * 365 * 86_400_000;

export function destroyAfter(filedAtISO: string): string {
  return new Date(Date.parse(filedAtISO) + SEVEN_YEARS_MS).toISOString();
}

/** An open notice places a legal hold that blocks destruction. */
export function underLegalHold(openNoticeCount: number): boolean {
  return openNoticeCount > 0;
}
