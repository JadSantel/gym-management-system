import { z } from "zod";
import { dayStart, manilaDay, manilaMonthRange } from "./attendance-schema";

export const reportQuerySchema = z.strictObject({
  tab: z.enum(["members", "revenue", "attendance"]).default("members"),
  week: z.iso.date().optional(), from: z.iso.date().optional(), to: z.iso.date().optional(),
  page: z.string().regex(/^[1-9]\d{0,6}$/).default("1").transform(Number),
});
export const DAY = 86_400_000;
export function reportDates(query: z.infer<typeof reportQuerySchema>, now: Date) {
  const today = manilaDay(now), from = query.from ?? today, to = query.to ?? from;
  const week = dayStart(query.week ?? today);
  week.setUTCDate(week.getUTCDate() - (new Date(week.getTime() + 8 * 3_600_000).getUTCDay() + 6) % 7);
  return { from, to, week: manilaDay(week), weekStart: week, weekEnd: new Date(week.getTime() + 7 * DAY), end: new Date(dayStart(to).getTime() + DAY) };
}
export function comparisonDates(now: Date) {
  const { start } = manilaMonthRange(now);
  // Work on local calendar month starts: UTC date is the previous month's final day.
  const local = new Date(start.getTime() + 8 * 3_600_000);
  local.setUTCMonth(local.getUTCMonth() - 1);
  const previousStart = new Date(local.getTime() - 8 * 3_600_000);
  return { start, previousStart, previousEnd: new Date(Math.min(start.getTime(), previousStart.getTime() + now.getTime() - start.getTime())) };
}
export function csvCell(value: string) {
  const safe = /^[\s\u0000-\u001f]*[=+@-]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
