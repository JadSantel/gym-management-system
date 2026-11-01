import { inGym } from "./tenant";
import { IdentityError } from "./identity";
import { historyQuerySchema } from "./history-schema";

export async function paymentHistory(headers: Headers, input: unknown) {
  const parsed = historyQuerySchema.safeParse(input);
  if (!parsed.success) throw new IdentityError(400, "Check the history filters. Use a valid date or record reference.");
  const query = parsed.data;
  return inGym(headers, "MEMBERS", async tx => {
    const start = query.date ? new Date(`${query.date}T00:00:00+08:00`) : null;
    const transfers = query.reference ? await tx.digitalClaim.findMany({ where: { transactionReference: { contains: query.reference, mode: "insensitive" } }, select: { chargeId: true } }) : [];
    const payments = await tx.payment.findMany({ where: {
      ...(query.memberId ? { memberId: query.memberId } : {}), ...(query.member ? { member: { fullName: { contains: query.member, mode: "insensitive" } } } : {}),
      ...(query.method ? { method: query.method } : {}), ...(query.collectorId ? { collectedBy: query.collectorId } : {}),
      ...(start ? { collectedAt: { gte: start, lt: new Date(start.getTime() + 86_400_000) } } : {}),
      ...(query.reference ? { OR: [{ reference: { contains: query.reference, mode: "insensitive" } }, { receipt: { reference: { contains: query.reference, mode: "insensitive" } } }, { chargeId: { in: transfers.map(row => row.chargeId) } }] } : {}),
    }, orderBy: [{ collectedAt: "desc" }, { id: "desc" }], take: 51,
    include: { member: { select: { fullName: true } }, collector: { select: { user: { select: { name: true } } } }, receipt: true, period: true } });
    const operators = await tx.operator.findMany({ select: { id: true, user: { select: { name: true } } } });
    return { payments: payments.slice(0, 50), morePayments: payments.length > 50, operators };
  });
}
