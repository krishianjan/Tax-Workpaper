import {
  PacketSchema,
  type Packet,
  type PacketDocument,
  type PacketExtractedValue,
  type PacketReturnVersion,
  type PacketReturnLine,
  type PacketStaff,
} from "./schema";

// A normalized, indexed view of the packet. Pure logic (verify, trace,
// disposition, checks) operates on this — never on the DB — so tests run
// without a database.

export interface PacketModel {
  raw: Packet;
  sha256: string;
  documents: PacketDocument[];
  docById: Map<string, PacketDocument>;
  evById: Map<string, PacketExtractedValue>;
  evsByDoc: Map<string, PacketExtractedValue[]>;
  versions: PacketReturnVersion[];
  versionById: Map<string, PacketReturnVersion>;
  /** version id -> (line key -> line) */
  lineByVersionKey: Map<string, Map<string, PacketReturnLine>>;
  staff: PacketStaff[];
  staffById: Map<string, PacketStaff>;
  clientItemById: Map<string, Record<string, unknown>>;
}

function indexClientItems(packet: Packet): Map<string, Record<string, unknown>> {
  const m = new Map<string, Record<string, unknown>>();
  const client = packet.client as Record<string, unknown>;
  const buckets: Array<[string, string]> = [
    ["questionnaire", "qa"],
    ["messages", "msg"],
    ["call_notes", "call"],
  ];
  for (const [bucket] of buckets) {
    const arr = client[bucket];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item && typeof item === "object" && "id" in item) {
          m.set(String((item as Record<string, unknown>).id), item as Record<string, unknown>);
        }
      }
    }
  }
  return m;
}

export function buildModel(raw: Packet, sha256: string): PacketModel {
  const docById = new Map<string, PacketDocument>();
  const evsByDoc = new Map<string, PacketExtractedValue[]>();
  const evById = new Map<string, PacketExtractedValue>();

  for (const d of raw.documents) {
    docById.set(d.id, d);
    evsByDoc.set(d.id, []);
  }
  for (const ev of raw.extracted_values) {
    evById.set(ev.id, ev);
    const list = evsByDoc.get(ev.document_id);
    if (list) list.push(ev);
    else evsByDoc.set(ev.document_id, [ev]);
  }

  const versionById = new Map<string, PacketReturnVersion>();
  const lineByVersionKey = new Map<string, Map<string, PacketReturnLine>>();
  for (const v of raw.return_versions) {
    versionById.set(v.version, v);
    const lines = new Map<string, PacketReturnLine>();
    for (const ln of v.lines) lines.set(ln.key, ln);
    lineByVersionKey.set(v.version, lines);
  }

  const staff = raw.firm.staff;
  const staffById = new Map<string, PacketStaff>();
  for (const s of staff) staffById.set(s.id, s);

  return {
    raw,
    sha256,
    documents: raw.documents,
    docById,
    evById,
    evsByDoc,
    versions: raw.return_versions,
    versionById,
    lineByVersionKey,
    staff,
    staffById,
    clientItemById: indexClientItems(raw),
  };
}

/** Validate a raw object into a Packet. Throws on failure (fail loudly). */
export function validatePacket(data: unknown): Packet {
  return PacketSchema.parse(data);
}
