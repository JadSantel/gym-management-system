import { z } from "zod";
import { parsePesos } from "./money";
import { recordIdSchema } from "./route-schema";

const priceMessage = "Enter a positive PHP price with no more than two decimal places (maximum ₱21,474,836.47).";
const cashMessage = "Enter the full cash amount in PHP, with no more than two decimal places.";
// Keep decimal text unchanged; the existing exact parser supplies centavos and retry fingerprints.
export const priceSchema = z.string({ error: priceMessage }).refine(value => parsePesos(value) !== null, priceMessage);
export const cashAmountSchema = z.string({ error: cashMessage }).refine(value => parsePesos(value) !== null, cashMessage);
export const planChangeSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("initialize") }),
  z.strictObject({
    action: z.literal("update"), planId: recordIdSchema, price: priceSchema,
    version: z.number({ error: "Use a current approved plan and price." }).int("Use a current approved plan and price.")
      .min(1, "Use a current approved plan and price.").max(2_147_483_646, "Use a current approved plan and price."),
  }),
]);
export const chargePrepareSchema = z.strictObject({ memberId: recordIdSchema, planId: recordIdSchema });
export const cashConfirmationSchema = z.strictObject({ chargeId: recordIdSchema, cashReceived: cashAmountSchema });
export const idempotencyKeySchema = z.string({ error: "A valid Idempotency-Key is required for cash confirmation." })
  .length(36, "A valid Idempotency-Key is required for cash confirmation.")
  .regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, "A valid Idempotency-Key is required for cash confirmation.");
export const pendingCashSchema = z.strictObject({ key: z.uuid(), amount: cashAmountSchema, chargeId: z.uuid(), memberId: z.uuid() });

export type PlanChange = z.infer<typeof planChangeSchema>;
export type PendingCash = z.infer<typeof pendingCashSchema>;

export function financeFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (field === "planId" || field === "memberId" || field === "chargeId" || field === "price" || field === "cashReceived" || field === "version") {
      fields[field] ??= issue.message;
    }
  }
  return fields;
}
