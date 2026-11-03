import { z } from "zod";

// Zod schema for the packet. Strict on the fields the workpaper relies on;
// tolerant (passthrough) on the large reference blobs used in later blocks.
// Validation runs at import; failures abort the transaction (fail loudly).

export const PositionSchema = z.object({
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number(),
});

export const PageSchema = z.object({
  page: z.number().int(),
  printed_content: z.string(),
});

export const ExtractionSchema = z.object({
  status: z.enum(["extracted", "partial", "not_extracted"]),
  values: z.unknown().optional(),
  reason: z.string().nullable().optional(),
});

export const DocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  document_type: z.string(),
  issuer: z.string().nullable().optional(),
  belongs_to: z.string().nullable().optional(),
  tax_year: z.number().int().nullable().optional(),
  received_at: z.string().nullable().optional(),
  uploaded_by: z.string().nullable().optional(),
  file_name: z.string().nullable().optional(),
  page_count: z.number().int(),
  pages: z.array(PageSchema),
  marked_corrected: z.unknown().optional(),
  extraction: ExtractionSchema,
});

export const ValueTypeSchema = z.enum([
  "money",
  "date",
  "text",
  "integer",
  "quantity",
  "percent",
  "boolean",
  "code",
  "ssn",
  "ein",
  "account_number",
]);

export const ExtractedValueSchema = z.object({
  id: z.string(),
  document_id: z.string(),
  page: z.number().int().nullable().optional(),
  field: z.string(),
  label: z.string().nullable().optional(),
  value: z.unknown(),
  value_type: ValueTypeSchema,
  text_as_read: z.string().default(""),
  position: PositionSchema.nullable().optional(),
  confidence: z.number(),
});

export const ReturnLineSchema = z.object({
  key: z.string(),
  jurisdiction: z.string(),
  form: z.string().nullable().optional(),
  line: z.union([z.string(), z.number()]).nullable().optional(),
  label: z.string().nullable().optional(),
  value: z.unknown(),
  rule: z.string().nullable().optional(),
  inputs: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
  note: z.string().nullable().optional(),
});

export const DiagnosticSchema = z.object({
  code: z.string(),
  severity: z.string(),
  message: z.string(),
  refs: z.array(z.string()).default([]),
});

export const ReturnVersionSchema = z.object({
  version: z.string(),
  computed_at: z.string(),
  trigger: z.string().nullable().optional(),
  documents_used: z.array(z.string()).default([]),
  documents_superseded: z.array(z.string()).default([]),
  summary: z.record(z.unknown()),
  tax_effect_rates: z.record(z.unknown()),
  carryovers_out: z.unknown().optional(),
  assets: z.array(z.record(z.unknown())).default([]),
  diagnostics: z.array(DiagnosticSchema).default([]),
  changes_from_previous: z.array(z.record(z.unknown())).default([]),
  lines: z.array(ReturnLineSchema),
});

export const StaffSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  role: z.string(),
  credential: z.string().nullable().optional(),
  sensitive_data_clearance: z.boolean().default(false),
  active_from: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const PacketSchema = z
  .object({
    packet: z.object({
      name: z.string(),
      version: z.string(),
      generated: z.string(),
      client_id: z.string(),
    }),
    readme: z.record(z.unknown()),
    household: z.record(z.unknown()),
    documents: z.array(DocumentSchema),
    extracted_values: z.array(ExtractedValueSchema),
    client: z.record(z.unknown()),
    firm: z
      .object({
        staff: z.array(StaffSchema).default([]),
        client_users: z.array(z.record(z.unknown())).default([]),
        starter_standards: z.record(z.unknown()),
      })
      .passthrough(),
    prior_years: z.record(z.unknown()),
    tax_agency_records: z.record(z.unknown()),
    timeline: z.array(z.record(z.unknown())),
    engine_reference: z.record(z.unknown()),
    return_versions: z.array(ReturnVersionSchema),
  })
  .passthrough();

export type Packet = z.infer<typeof PacketSchema>;
export type PacketDocument = z.infer<typeof DocumentSchema>;
export type PacketExtractedValue = z.infer<typeof ExtractedValueSchema>;
export type PacketReturnVersion = z.infer<typeof ReturnVersionSchema>;
export type PacketReturnLine = z.infer<typeof ReturnLineSchema>;
export type PacketStaff = z.infer<typeof StaffSchema>;
export type ValueType = z.infer<typeof ValueTypeSchema>;
