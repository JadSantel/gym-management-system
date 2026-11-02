import { z } from "zod";
import { recordIdSchema } from "./route-schema";

const optionalId = z.union([recordIdSchema, z.literal("")]).optional();
const date = z.union([z.iso.date().refine(value => value >= "0001-01-01"), z.literal("")]).optional();
export const historyQuerySchema = z.strictObject({
  member: z.string().trim().max(100).optional(),
  memberId: optionalId,
  reference: z.string().trim().max(100).optional(),
  date,
  from: date,
  to: date,
  status: z.enum(["", "CONFIRMED", "PENDING"]).optional(),
  method: z.enum(["", "CASH", "GCASH", "BANK"]).optional(),
  collectorId: optionalId,
  page: z.string().regex(/^[1-9]\d{0,8}$/).optional(),
  pageSize: z.enum(["10", "20", "30"]).optional(),
}).superRefine((query, context) => {
  if (query.from && query.to && query.from > query.to) {
    context.addIssue({ code: "custom", path: ["to"], message: "End date must be on or after start date." });
  }
  if (query.date && (query.from || query.to)) {
    context.addIssue({ code: "custom", path: ["date"], message: "Use a single date or a date range." });
  }
});

export type HistoryQuery = z.infer<typeof historyQuerySchema>;
