import "server-only";
import { inGym } from "./tenant";
import { IdentityError } from "./identity";
import { dayStart, manilaDay, visitStatus } from "./attendance-schema";
import { comparisonDates, csvCell, DAY, reportDates, reportQuerySchema } from "./reports-schema";

function parseQuery(input: unknown) {
  const result = reportQuerySchema.safeParse(input);
  if (!result.success) throw new IdentityError(400, "Check the report tab, dates and page.");
  return result.data;
}

export async function reportOverview(headers: Headers, clock = () => new Date()) {
  return inGym(headers, "OWNER", async tx => {
    const now = clock(), dates = comparisonDates(now);
    const total = await tx.member.count();
    const newMembers = await tx.member.count({ where: { createdAt: { gte: dates.start, lte: now } } });
    const plans = await tx.plan.findMany({ orderBy: [{ durationDays: "asc" }, { id: "asc" }], select: { id: true, name: true } });
    const intervals = await tx.effectiveEntitlement.findMany({
      where: { isCurrentProjection: true, endsAt: { gt: now } }, orderBy: [{ memberId: "asc" }, { startsAt: "asc" }],
      select: { memberId: true, startsAt: true, endsAt: true, period: { select: { payment: { select: { charge: { select: { planId: true } } } } } } },
    });
    const byPlan = plans.map(plan => ({ ...plan, count: 0 }));
    const historical = { id: "historical", name: "Historical access", count: 0 };
    let active = 0, expiring = 0;
    const members = new Map<string, typeof intervals>();
    for (const interval of intervals) {
      const rows = members.get(interval.memberId) ?? []; rows.push(interval); members.set(interval.memberId, rows);
    }
    for (const rows of members.values()) {
      const current = rows.find(row => row.startsAt <= now && now < row.endsAt);
      if (!current) continue;
      active++;
      const group = byPlan.find(plan => plan.id === current.period?.payment.charge.planId) ?? historical;
      group.count++;
      let end = current.endsAt;
      for (const row of rows) if (row.startsAt <= end && row.endsAt > end) end = row.endsAt;
      if (end.getTime() <= now.getTime() + 7 * DAY) expiring++;
    }
    if (historical.count) byPlan.push(historical);
    const collections = await tx.payment.findMany({ where: { OR: [
      { collectedAt: { gte: dates.start, lte: now } },
      { collectedAt: { gte: dates.previousStart, lte: dates.previousEnd, lt: dates.start } },
    ] }, select: { collectedAt: true, amountCentavos: true, charge: { select: { planId: true, planName: true } } } });
    let current = 0, previous = 0;
    const mix = new Map<string, { id: string; name: string; amount: number; count: number }>();
    for (const row of collections) {
      if (row.collectedAt < dates.start) { previous += row.amountCentavos; continue; }
      current += row.amountCentavos;
      // Group by the recorded name too: a later catalogue rename cannot relabel a past sale.
      const key = `${row.charge.planId}:${row.charge.planName}`;
      const item = mix.get(key) ?? { id: key, name: row.charge.planName, amount: 0, count: 0 };
      item.amount += row.amountCentavos; item.count++; mix.set(key, item);
    }
    return { checkedAt: now, members: { total, newMembers, active, expiring, plans: byPlan },
      revenue: { current, previous, ...dates, mix: [...mix.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)) } };
  });
}

export async function reportAttendance(headers: Headers, input: unknown, exportAll = false, clock = () => new Date()) {
  const query = parseQuery(input);
  return inGym(headers, "OWNER", async tx => {
    const now = clock(), dates = reportDates(query, now);
    if (dates.from > dates.to || dates.end.getTime() - dayStart(dates.from).getTime() > 366 * DAY)
      throw new IdentityError(400, "Choose a date range of up to 366 days, with the end on or after the start.");
    const where = { voided: false, arrivedAt: { gte: dayStart(dates.from), lt: dates.end, lte: now } };
    const count = await tx.attendanceVisit.count({ where });
    if (exportAll && count > 50_000) throw new IdentityError(400, "This export exceeds 50,000 visits. Choose a shorter date range.");
    const pages = Math.max(1, Math.ceil(count / 20)), page = Math.min(query.page, pages);
    const visits = await tx.attendanceVisit.findMany({ where, orderBy: [{ arrivedAt: "asc" }, { id: "asc" }], take: exportAll ? 50_001 : 20, skip: exportAll ? 0 : (page - 1) * 20 });
    if (exportAll && visits.length > 50_000) throw new IdentityError(400, "This export exceeds 50,000 visits. Choose a shorter date range.");
    const names = new Map((await tx.member.findMany({ where: { id: { in: [...new Set(visits.map(row => row.memberId))] } }, select: { id: true, fullName: true } })).map(row => [row.id, row.fullName]));
    const days = exportAll ? [] : await tx.$queryRaw<{ day: string; count: number }[]>`
      SELECT to_char(arrived_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS day, count(*)::integer AS count
      FROM attendance_visits WHERE NOT voided AND arrived_at >= ${dates.weekStart} AND arrived_at < ${dates.weekEnd} AND arrived_at <= ${now}
      GROUP BY 1 ORDER BY 1`;
    return { ...dates, checkedAt: now, count, page, pages,
      days: Array.from({ length: 7 }, (_, i) => { const date = manilaDay(new Date(dates.weekStart.getTime() + i * DAY)); return { date, count: date > manilaDay(now) ? null : days.find(row => row.day === date)?.count ?? 0 }; }),
      visits: visits.map(row => ({ id: row.id, memberId: row.memberId, name: names.get(row.memberId)!, arrivedAt: row.arrivedAt, notes: `${visitStatus(row, now)}${row.revision > 1 ? "; Corrected visit" : ""}` })),
    };
  });
}

export async function attendanceCsv(headers: Headers, input: unknown, clock = () => new Date()) {
  const data = await reportAttendance(headers, input, true, clock);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  return { from: data.from, to: data.to, csv: "\uFEFFDate,Member ID,Name,Time in,Notes\r\n" + data.visits.map(row =>
    [manilaDay(row.arrivedAt), row.memberId, row.name, time.format(row.arrivedAt), row.notes].map(csvCell).join(",")
  ).join("\r\n") + (data.visits.length ? "\r\n" : "") };
}
