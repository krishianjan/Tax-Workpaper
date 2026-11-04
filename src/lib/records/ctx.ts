import type { PacketModel } from "../packet/model";
import type { Adjustment } from "../change/types";
import type { RecordMeta, RecordMode } from "./mode";

// What every Feature 8 record component receives.
export interface RecordCtx {
  model: PacketModel;
  versionId: string;
  mode: RecordMode;
  adjustments: Adjustment[];
  meta: RecordMeta;
}
