import { z } from "zod";
import { recordIdSchema } from "./route-schema";

const reference = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9 ._/#:-]*$/, "Use an opaque source reference.").transform(value => value.toUpperCase());
const notes = z.string().trim().min(1).max(500);
export const legacyCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("prepare"), memberId: recordIdSchema, previousId: recordIdSchema.nullable(),
    sourceReference: reference, sourceType: z.enum(["GYM_REGISTER", "ACCESS_CARD", "ACCESS_AGREEMENT"]),
    corroboratingReference: reference.nullable(), interpretation: z.enum(["INSTANTS", "VALID_THROUGH_DATES"]),
    claimedStart: z.string().max(40).nullable(), claimedEnd: z.string().max(40).nullable(),
    uncertainty: z.enum(["CERTAIN", "CONFLICTING_EXPIRY", "UNSUPPORTED_PAYMENT", "UNPAID_BALANCE", "AMBIGUOUS_INTERVAL"]), notes }),
  z.strictObject({ action: z.literal("review"), proposalId: recordIdSchema,
    decision: z.enum(["APPROVE", "FLAG", "REJECT"]), independentlyChecked: z.literal(true), notes }),
]);
export const legacyRecoverySchema = z.strictObject({ key: z.uuid(), command: legacyCommandSchema });
export type LegacyCommand = z.infer<typeof legacyCommandSchema>;
export function legacyFieldErrors(error: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) if (typeof issue.path[0] === "string") fields[issue.path[0]] ??= issue.message;
  return fields;
}
export function legacyInterval(interpretation: string, start: string | null, end: string | null) {
  if (start === null && end === null) return null;
  if (interpretation === "VALID_THROUGH_DATES") {
    if (!z.iso.date().safeParse(start).success || !z.iso.date().safeParse(end).success || start!.startsWith("0000-") || end!.startsWith("0000-")) return null;
    const startsAt = new Date(`${start}T00:00:00+08:00`);
    const endsAt = new Date(new Date(`${end}T00:00:00+08:00`).getTime() + 86_400_000);
    return startsAt < endsAt && endsAt.getUTCFullYear() <= 9999 ? { startsAt, endsAt } : null;
  }
  if (!z.iso.datetime({ offset: true }).safeParse(start).success || !z.iso.datetime({ offset: true }).safeParse(end).success) return null;
  if ([start!,end!].some(value => value.startsWith("0000-") || /\.\d{4,}/.test(value))) return null;
  const startsAt = new Date(start!); const endsAt = new Date(end!);
  return startsAt < endsAt ? { startsAt, endsAt } : null;
}
