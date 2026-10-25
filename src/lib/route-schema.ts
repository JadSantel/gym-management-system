import { z } from "zod";

// Preserve the application's UUID wire format, including case and version acceptance.
export const recordIdSchema = z.string({ error: "Invalid record reference." })
  .length(36, "Invalid record reference.")
  .regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, "Invalid record reference.");
export const recordParamsSchema = z.strictObject({ id: recordIdSchema });
export const memberQuerySchema = z.strictObject({ charge: z.union([recordIdSchema, z.literal("")]).optional() });
export const loginQuerySchema = z.strictObject({ signedOut: z.enum(["true", "false"]).optional() });
// Only application-reviewed provider entry points; Better Auth owns their payloads.
export const authEndpointSchema = z.enum(["sign-in/email", "sign-in/username", "sign-out", "get-session"]);
