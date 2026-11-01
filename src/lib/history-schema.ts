import { z } from "zod";
import { recordIdSchema } from "./route-schema";

const optionalId = z.union([recordIdSchema, z.literal("")]).optional();
const date = z.union([z.iso.date(), z.literal("")]).optional();
export const historyQuerySchema = z.strictObject({
  member: z.string().trim().max(100).optional(),
  memberId: optionalId,
  reference: z.string().trim().max(100).optional(),
  date,
  method: z.enum(["", "CASH", "GCASH", "BANK"]).optional(),
  collectorId: optionalId,
});
