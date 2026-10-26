import { z } from "zod";
import { inGym } from "./tenant";
import { IdentityError } from "./identity";

export const pilotWindowSchema = z.strictObject({ start: z.iso.date(), end: z.iso.date() }).refine(value => value.start < value.end && new Date(value.end).getTime() - new Date(value.start).getTime() <= 31 * 86_400_000, "Choose a half-open window of 1–31 days.");
export async function pilotEvidence(headers: Headers, input: unknown) {
  const parsed = pilotWindowSchema.safeParse(input);
  if (!parsed.success) throw new IdentityError(400, "Choose valid start and exclusive end dates, at most 31 days apart.");
  const start = new Date(`${parsed.data.start}T00:00:00+08:00`); const end = new Date(`${parsed.data.end}T00:00:00+08:00`);
  return inGym(headers, "MEMBERS", async (tx, actor) => {
    const payments = await tx.payment.findMany({ where: { OR: [{ collectedAt: { gte: start, lt: end } }, { enteredAt: { gte: start, lt: end } }] },
      orderBy: [{ collectedAt: "asc" }, { id: "asc" }], take: 201, include: { receipt: true } });
    const confirmations = await tx.outageConfirmation.findMany({ where: { paymentId: { in: payments.map(p => p.id) } } });
    const entries = await tx.outageEntry.findMany({ where: { id: { in: confirmations.map(c => c.entryId) } } });
    const legacy = await tx.legacyRecord.findMany({ orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 201 });
    const cases = await tx.investigationCase.findMany({ orderBy: { openedAt: "desc" }, take: 201 });
    const settlements = await tx.investigationEvent.findMany({ where: { kind: "SETTLE", OR: [{ settledAt: { gte: start, lt: end } }, { createdAt: { gte: start, lt: end } }] }, orderBy: { createdAt: "asc" }, take: 201 });
    return { ...parsed.data, payments, entries, confirmations, legacy, cases, settlements,
      truncated: [payments,legacy,cases,settlements].some(rows => rows.length > 200), gymName: actor.operator.gym.name, asOf: new Date() };
  }, true);
}
