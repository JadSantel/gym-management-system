import "server-only";
import { inGym } from "./tenant";
const manilaDate = (date: Date) => new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

export async function workspaceOverview(headers: Headers) {
  return inGym(headers, "OWNER", async tx => {
    const now = new Date();
    const start = new Date(`${manilaDate(now)}T00:00:00+08:00`);
    const weekStart = new Date(start.getTime() - 6 * 86_400_000);
    const end = new Date(start.getTime() + 86_400_000);
    const collections = await tx.payment.findMany({ where: { method: "CASH", collectedAt: { gte: weekStart, lt: end } }, select: { collectedAt: true, amountCentavos: true } });
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart.getTime() + index * 86_400_000);
      const rows = collections.filter(row => manilaDate(row.collectedAt) === manilaDate(date));
      return { date, amount: rows.reduce((sum, row) => sum + row.amountCentavos, 0), count: rows.length };
    });
    const activeMembers = await tx.member.count({ where: { entitlements: { some: { isCurrentProjection: true, startsAt: { lte: now }, endsAt: { gt: now } } } } });
    const payments = await tx.payment.findMany({ orderBy: [{ collectedAt: "desc" }, { id: "desc" }], take: 4, include: { member: { select: { fullName: true } }, receipt: true } });
    return { days, activeMembers, payments, checkedAt: now };
  });
}
