import { inGym } from "./tenant";
import { IdentityError } from "./identity";
import { historyQuerySchema } from "./history-schema";
import type { Prisma } from "../generated/prisma/client";

export async function paymentHistory(headers: Headers, input: unknown) {
  const parsed = historyQuerySchema.safeParse(input);
  if (!parsed.success) throw new IdentityError(400, "Check the history filters. Use a valid date or record reference.");
  const query = parsed.data;
  return inGym(headers, "MEMBERS", async (tx, actor) => {
    const checkedAt = new Date();
    const from = query.from || query.date;
    const to = query.to || query.date;
    const dates: Prisma.PaymentWhereInput = from || to ? { collectedAt: {
      ...(from ? { gte: new Date(`${from}T00:00:00+08:00`) } : {}),
      ...(to ? { lt: new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86_400_000) } : {}),
    } } : {};
    // Aggregate the complete date range, independently of the current result page.
    const methods = await tx.payment.groupBy({ by: ["method"], where: dates, _sum: { amountCentavos: true }, _count: true });
    const methodTotal = (method: string) => {
      const group = methods.find(row => row.method === method);
      return { amount: group?._sum.amountCentavos ?? 0, count: group?._count ?? 0 };
    };
    const summary = {
      amount: methods.reduce((sum, row) => sum + (row._sum.amountCentavos ?? 0), 0),
      count: methods.reduce((sum, row) => sum + row._count, 0),
      cash: methodTotal("CASH"), bank: methodTotal("BANK"),
    };
    const transfers = query.reference ? await tx.digitalClaim.findMany({ where: { transactionReference: { contains: query.reference, mode: "insensitive" } }, select: { chargeId: true } }) : [];
    const where: Prisma.PaymentWhereInput = {
      ...(query.memberId ? { memberId: query.memberId } : {}), ...(query.member ? { member: { fullName: { contains: query.member, mode: "insensitive" } } } : {}),
      ...(query.method ? { method: query.method } : {}), ...(query.collectorId ? { collectedBy: query.collectorId } : {}),
      ...dates,
      ...(query.reference ? { OR: [{ reference: { contains: query.reference, mode: "insensitive" } }, { receipt: { reference: { contains: query.reference, mode: "insensitive" } } }, { chargeId: { in: transfers.map(row => row.chargeId) } }] } : {}),
    };
    // Payments are committed confirmations. Pending claims remain on member history.
    const totalRows = query.status === "PENDING" ? 0 : await tx.payment.count({ where });
    const pageSize = Number(query.pageSize ?? "10");
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const page = Math.min(Number(query.page ?? "1"), totalPages);
    const payments = totalRows === 0 ? [] : await tx.payment.findMany({ where,
    orderBy: [{ collectedAt: "desc" }, { id: "desc" }], take: pageSize, skip: (page - 1) * pageSize,
    include: { member: { select: { fullName: true } }, collector: { select: { user: { select: { name: true } } } }, receipt: true, period: true, charge: { select: { planName: true, durationDays: true } } } });
    const operators = await tx.operator.findMany({ select: { id: true, user: { select: { name: true } } } });
    return { payments, pagination: { page, pageSize, totalRows, totalPages }, operators, summary, query, checkedAt,
      canCollect: actor.operator.role === "OWNER" || actor.operator.canCollectCash };
  });
}

export type PaymentHistoryData = Awaited<ReturnType<typeof paymentHistory>>;
