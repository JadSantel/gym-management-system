import { z } from "zod";
import { recordIdSchema } from "./route-schema";
import { priceSchema } from "./finance-schema";
import { parsePesos } from "./money";

const ref = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9 ._/#:-]*$/, "Use an opaque evidence reference without credentials.");
const instant = z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString());
const number = z.number().int().min(1).max(999_999_999);
const numbers = z.array(number).max(200);
const zeroAmount = z.string().refine(value => value === "0" || value === "0.00" || parsePesos(value) !== null, "Enter an exact PHP amount, including zero when no cash is held.");
export const outageCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("register"), code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,15}$/, "Use 2–16 letters and digits, starting with a letter."), first: number, last: number, custodianId: recordIdSchema }),
  z.strictObject({ action: z.literal("verifier"), operatorId: recordIdSchema, active: z.boolean() }),
  z.strictObject({ action: z.literal("enter"), bookId: recordIdSchema, number, memberId: recordIdSchema, priceId: recordIdSchema,
    method: z.literal("CASH", { error: "Only full cash qualifies for an outage receipt." }), amount: priceSchema,
    collectorId: recordIdSchema, collectedAt: instant, issuedAt: instant, receiptReference: ref, cashReference: ref,
    historyCertain: z.literal(true, { error: "Uncertain historical price or date must remain an owner investigation." }),
    visit: z.strictObject({ at: instant, authorizerId: recordIdSchema, reference: ref }).nullable() }),
  z.strictObject({ action: z.literal("handover"), bookId: recordIdSchema, toId: recordIdSchema, actualAt: instant,
    used: numbers, unused: numbers, void: numbers, missing: numbers, cashHeld: zeroAmount, cashTransferred: zeroAmount,
    transferReference: ref, evidenceReference: ref, outstanding: z.string().trim().min(1).max(500), bothSigned: z.literal(true) }),
  z.strictObject({ action: z.literal("exception"), bookId: recordIdSchema, number, kind: z.enum(["VOID", "MISSING", "INVALID", "CONFLICT", "LOST_COPY", "LATER_VISIT"]),
    actualAt: instant, memberId: recordIdSchema.nullable(), evidenceReference: ref, reasoning: z.string().trim().min(1).max(500) }),
  z.strictObject({ action: z.literal("verify"), bookId: recordIdSchema, entryId: recordIdSchema,
    receiptEvidence: ref, cashEvidence: ref, custodyEvidence: ref, independentlyMatched: z.literal(true) }),
]);
export const outageKeySchema = z.uuid();
export const outageRecoverySchema = z.strictObject({ key: outageKeySchema, command: outageCommandSchema });
export type OutageCommand = z.infer<typeof outageCommandSchema>;
export function outageFieldErrors(error: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const name = issue.path[0];
    if (typeof name === "string") fields[name] ??= "Check this field. Use the recorded full amount, identity, reference or actual PHT time.";
  }
  return fields;
}
