import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildModel, validatePacket, type PacketModel } from "./model";

// Loads data/packet.json once, validates, and caches the built model.
// Used by server components and tests so everything reads one source of truth.

let cached: PacketModel | null = null;

export function packetPath(): string {
  return join(process.cwd(), "data", "packet.json");
}

export function loadModel(): PacketModel {
  if (cached) return cached;
  const buf = readFileSync(packetPath());
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const raw = validatePacket(JSON.parse(buf.toString("utf8")));
  cached = buildModel(raw, sha256);
  return cached;
}

/** Test helper: force a fresh build. */
export function resetModelCache(): void {
  cached = null;
}
