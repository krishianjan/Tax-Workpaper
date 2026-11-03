import "server-only";
import { cookies } from "next/headers";
import { loadModel } from "./packet/load";
import { DEFAULT_AS_OF } from "./evidence/disposition";
import type { PacketStaff } from "./packet/schema";

// The acting user and the as-of clock, both enforced server-side. Masking and
// role gates read from here, never from client-supplied values.

export interface Session {
  staff: PacketStaff;
  cleared: boolean;
  asOf: string;
}

const FALLBACK_STAFF: PacketStaff = {
  id: "st-01",
  role: "preparer",
  credential: null,
  sensitive_data_clearance: true,
};

export async function getSession(): Promise<Session> {
  const model = loadModel();
  const jar = await cookies();
  const roleId = jar.get("wp_role")?.value ?? "st-01";
  const asOf = jar.get("wp_asof")?.value ?? DEFAULT_AS_OF;
  const staff = model.staffById.get(roleId) ?? FALLBACK_STAFF;
  return { staff, cleared: staff.sensitive_data_clearance === true, asOf };
}
