import { z } from "zod";
import { recordIdSchema } from "./route-schema";
import { priceSchema } from "./finance-schema";

export const caseReasons = {
  MISSING_PAYMENT: "Missing payment", DUPLICATE_RECORD: "Duplicate records, one collection", TWO_COLLECTIONS: "Two actual collections",
  INCORRECT_ENTRY: "Incorrect entry", CANCEL_BEFORE_USE: "Cancellation before use", CANCEL_AFTER_USE: "Cancellation after use", FUNDS_ABSENT: "Reversal or funds absent",
} as const;
const reason = z.enum(Object.keys(caseReasons) as [keyof typeof caseReasons, ...(keyof typeof caseReasons)[]]);
const text = z.string().trim().min(1).max(500).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Use one line of reasoning.");
const reference = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9 ._/#:-]*$/, "Use an opaque evidence reference, without credentials or URLs.")
  .refine(value => !value.includes("://"), "Use an opaque evidence reference, without URLs.");
const instant = z.iso.datetime({ offset: true });
const revision = z.number().int().min(1).max(2_147_483_646);
const event = { caseId: recordIdSchema, expectedRevision: revision, reasoning: text, evidenceReference: reference };
export const investigationCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("open"), memberId: recordIdSchema, reason, summary: text,
    evidenceReference: reference.optional(), originalCollectedAt: instant.optional(), claimedAmount: priceSchema.optional(), method: z.enum(["CASH", "GCASH", "BANK", "UNKNOWN"]) }),
  z.strictObject({ action: z.literal("note"), ...event }),
  z.strictObject({ action: z.literal("escalate"), ...event }),
  z.strictObject({ action: z.literal("link"), ...event, paymentId: recordIdSchema }),
  z.strictObject({ action: z.literal("request"), ...event, reason, paymentId: recordIdSchema, relatedPaymentId: recordIdSchema.optional(),
    collectionCount: z.enum(["ONE", "TWO", "UNKNOWN"]), amount: z.union([z.literal("0"), z.literal("0.00"), priceSchema]),
    method: z.enum(["CASH", "GCASH", "BANK"]), moneyOutcome: z.enum(["NO_MOVEMENT", "REFUND_PROPOSED", "CORRECTION_PROPOSED"]),
    accessOutcome: z.enum(["STAYS", "ENDS", "ADJUSTS"]), effectiveAt: instant, periodId: recordIdSchema, retainedPeriodId: recordIdSchema.optional() }),
  z.strictObject({ action: z.literal("review"), ...event, requestEventId: recordIdSchema, decision: z.enum(["APPROVE", "REJECT"]) }),
  z.strictObject({ action: z.literal("recover"), caseId: recordIdSchema }),
  z.strictObject({ action: z.literal("execute"), caseId: recordIdSchema }),
]);
export type InvestigationCommand = z.infer<typeof investigationCommandSchema>;
export const investigationKeySchema = z.uuid();
const optionalId = z.union([recordIdSchema, z.literal("")]).optional();
const date = z.union([z.iso.date(), z.literal("")]).optional();
export const historyQuerySchema = z.strictObject({ member: z.string().trim().max(100).optional(), memberId: optionalId,
  reference: z.string().trim().max(100).optional(), date, method: z.enum(["", "CASH", "GCASH", "BANK"]).optional(), collectorId: optionalId });
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export function investigationFieldErrors(error: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && /^[A-Za-z]+$/.test(field)) fields[field] ??= "Check this field. Use the displayed choices, an exact PHP amount, a reference or a valid time.";
  }
  return fields;
}

export const investigationGates = {
  recovery: "Recovery blocked: O-05 investigator authority and corroborating-evidence standards, plus recovered-payment effective dates, are unresolved. Digital recovery also requires designated-account verification. Preserve evidence and escalate to the owner.",
  execution: "Execution blocked: approved reason-specific case procedures/evidence are missing; O-03 also blocks discretionary refunds and excess-payment dispositions. Owner approval is a review record, not completed money movement or an access change.",
} as const;
