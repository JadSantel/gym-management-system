import { z } from "zod";
import { recordIdSchema } from "./route-schema";
export const qrCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Scan a personal member QR.");
export const qrCommandSchema = z.strictObject({ action: z.enum(["issue", "replace"]), requestId: z.uuid() });
export const scanSchema = z.strictObject({ code: qrCodeSchema, requestId: z.uuid() });
const instant = z.iso.datetime({ offset: true }).transform(value => new Date(value));
export const correctionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("correct"), visitId: recordIdSchema, revision: z.number().int().positive(), reason: z.string().trim().min(1).max(500), arrivedAt: instant, departedAt: instant.nullable(), requestId: z.uuid() }),
  z.strictObject({ action: z.literal("void"), visitId: recordIdSchema, revision: z.number().int().positive(), reason: z.string().trim().min(1).max(500), requestId: z.uuid() }),
]);
export const attendanceQuerySchema = z.strictObject({
  from: z.iso.date().optional(), to: z.iso.date().optional(), member: z.string().trim().max(100).default(""),
  view: z.enum(["ALL", "IN", "OUT", "MISSING"]).default("ALL"), page: z.string().regex(/^[1-9]\d{0,6}$/).default("1").transform(Number),
  pageSize: z.enum(["10", "20", "30"]).default("20").transform(Number),
}).refine(value => !value.from || !value.to || value.from <= value.to, "The end date must follow the start date.");
export function manilaDay(now: Date) { return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10); }
export function dayStart(day: string) { return new Date(`${day}T00:00:00+08:00`); }
export function manilaMonthRange(now: Date) {
  const [year, month] = manilaDay(now).split("-").map(Number);
  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  return { start: dayStart(`${year}-${String(month).padStart(2, "0")}-01`), end: dayStart(`${nextMonth}-01`) };
}
export function visitStatus(visit: { voided: boolean; departedAt: Date | string | null; arrivedAt: Date | string }, now: Date) {
  return visit.voided ? "Voided" : visit.departedAt ? "Checked out" : manilaDay(new Date(visit.arrivedAt)) < manilaDay(now) ? "Missing checkout" : "Currently in gym";
}
