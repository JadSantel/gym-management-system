import { z } from "zod";
import { recordIdSchema } from "./route-schema";
import { parsePesos } from "./money";

export const closingDaySchema = z.iso.date().refine(value => value >= "2000-01-01" && value <= "2100-12-31", "Use a supported business date.");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const reference = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9 ._/#:-]*$/, "Use an opaque evidence reference.");
const notes = z.string().trim().min(1).max(500);
const amount = z.string().refine(value => value === "0" || value === "0.00" || parsePesos(value) !== null, "Enter exact PHP, including an explicit zero.");
export const closingCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("count"), day: closingDaySchema, sourceHash: hash, collectorId: recordIdSchema,
    method: z.enum(["CASH", "GCASH", "BANK"]), accountId: recordIdSchema.nullable(), caseId: recordIdSchema.nullish().transform(value => value ?? null),
    amount, cashHeld: amount, transferred: amount, paidFromBatch: amount,
    evidenceReference: reference, notes, independentlyChecked: z.literal(true), segregated: z.literal(true) }),
  z.strictObject({ action: z.literal("submit"), day: closingDaySchema, sourceHash: hash, previousId: recordIdSchema.nullable(),
    checkIds: z.array(recordIdSchema).min(1).max(60), evidenceReference: reference, notes, countsReaffirmed: z.literal(true) }),
  z.strictObject({ action: z.literal("approve"), snapshotId: recordIdSchema, sourceHash: hash, evidenceReference: reference, notes,
    acknowledgeUnresolved: z.literal(true) }),
]);
export const closingKeySchema = z.uuid();
export const closingRecoverySchema = z.strictObject({ key: closingKeySchema, command: closingCommandSchema });
export type ClosingCommand = z.infer<typeof closingCommandSchema>;
export function closingFieldErrors(error: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string") fields[key] ??= "Check this field and its count, reference or attestation.";
  }
  return fields;
}
