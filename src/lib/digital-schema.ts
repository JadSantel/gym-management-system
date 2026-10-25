import { z } from "zod";
import { recordIdSchema } from "./route-schema";
import { priceSchema } from "./finance-schema";

// Opaque references only. Do not collect account credentials or upload banking evidence.
const reference = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9 ._/#:-]*$/, "Use an evidence or transaction reference, without credentials.");
const instant = z.iso.datetime({ offset: true });
export const digitalConfirmationSchema = z.strictObject({ action: z.literal("confirm"), claimId: recordIdSchema, accountId: recordIdSchema, amount: priceSchema,
  transactionReference: reference.transform(value => value.toUpperCase()), receivedAt: instant,
  accountMatched: z.literal(true, { error: "Check actual funds in the designated receiving account first." }), evidenceReference: reference });
export const digitalCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("account"), label: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/), method: z.enum(["GCASH", "BANK"]) }),
  z.strictObject({ action: z.literal("verifier"), accountId: recordIdSchema, operatorId: recordIdSchema, active: z.boolean() }),
  z.strictObject({ action: z.literal("claim"), chargeId: recordIdSchema, accountId: recordIdSchema, amount: priceSchema,
    transactionReference: reference.transform(value => value.toUpperCase()), reportedReceivedAt: instant }),
  digitalConfirmationSchema,
  z.strictObject({ action: z.literal("flag"), paymentId: recordIdSchema, reason: z.enum(["DISPUTED", "REVERSED", "MISSING"]) }),
]);
export type DigitalCommand = z.infer<typeof digitalCommandSchema>;
export function digitalFieldErrors(error: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && /^[A-Za-z]+$/.test(field)) fields[field] ??= "Check this field and use a valid reference, amount or time.";
  }
  return fields;
}
export const digitalOperationKeySchema = z.uuid({ error: "A valid Idempotency-Key is required for digital confirmation." });
