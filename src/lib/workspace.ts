import "server-only";
import { inGym } from "./tenant";
import { dayStart, manilaDay } from "./attendance-schema";
import { summarizeAttendance } from "./attendance-summary";

export async function workspaceOverview(headers: Headers, clock = () => new Date()) {
  return inGym(headers, "OWNER", async tx => {
    const now = clock();
    const start = dayStart(manilaDay(now));
    const weekStart = new Date(start.getTime() - 6 * 86_400_000);
    const end = new Date(start.getTime() + 86_400_000);
    // Payment rows are committed full-funds confirmations, never prepared charges or pending claims.
    const collections = await tx.payment.findMany({ where: { collectedAt: { gte: weekStart, lt: end } }, select: { collectedAt: true, amountCentavos: true, method: true } });
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart.getTime() + index * 86_400_000);
      const rows = collections.filter(row => manilaDay(row.collectedAt) === manilaDay(date));
      const cash = rows.filter(row => row.method === "CASH").reduce((sum, row) => sum + row.amountCentavos, 0);
      const online = rows.filter(row => row.method === "GCASH" || row.method === "BANK").reduce((sum, row) => sum + row.amountCentavos, 0);
      return { date, amount: cash + online, cash, online, count: rows.length };
    });
    const activeMembers = await tx.member.count({ where: { entitlements: { some: { isCurrentProjection: true, startsAt: { lte: now }, endsAt: { gt: now } } } } });
    const payments = await tx.payment.findMany({ orderBy: [{ collectedAt: "desc" }, { id: "desc" }], take: 4, include: { member: { select: { fullName: true } }, receipt: true } });
    const attendance = summarizeAttendance(await tx.attendanceVisit.findMany({
      where: { voided: false, arrivedAt: { lte: now }, OR: [{ arrivedAt: { gte: start } }, { departedAt: { gt: start } }] },
      select: { arrivedAt: true, departedAt: true },
    }), now);
    return { days, activeMembers, payments, attendance, checkedAt: now };
  });
}
