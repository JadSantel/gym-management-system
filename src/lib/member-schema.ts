import { z } from "zod";
import { passwordSchema } from "./identity-schema";

const nameError = "Enter a member name with 1–100 visible characters.";
const memberNameSchema = z.string({ error: nameError }).min(1, nameError).max(100, nameError)
  .transform(value => value.normalize("NFKC").trim().replace(/\s+/g, " "))
  .refine(value => value.length >= 1 && value.length <= 100 && !/[\p{Cc}\p{Cf}]/u.test(value), nameError);

export const emailSchema = z.string().max(254).transform(value => value.trim().toLowerCase()).pipe(z.email({ error: "Enter a valid email address." }));
export const phoneSchema = z.string().max(32).transform(value => value.trim().replace(/[ ()-]/g, "").replace(/^09/, "+639"))
  .refine(value => /^\+639\d{9}$/.test(value), "Enter a Philippine mobile number starting with 09 or +639.");
const optionalEmail = z.union([z.literal(""), emailSchema, z.null()]).optional().transform(value => value || null);
const optionalPhone = z.union([z.literal(""), phoneSchema, z.null()]).optional().transform(value => value || null);
export const contactSchema = z.strictObject({ email: optionalEmail, phone: optionalPhone });
export const memberCreateSchema = z.strictObject({
  fullName: memberNameSchema,
  email: optionalEmail,
  phone: optionalPhone,
  confirmDuplicate: z.boolean({ error: "Confirm duplicate review explicitly." }).default(false),
});
export const registrationCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const registrationSchema = z.strictObject({ fullName: memberNameSchema, email: emailSchema, phone: phoneSchema,
  password: passwordSchema, confirmation: passwordSchema, requestId: z.uuid() })
  .refine(value => value.password === value.confirmation, { path: ["confirmation"], message: "Passwords must match." });
export const memberSearchSchema = z.string({ error: "Enter one member search of 100 characters or fewer." })
  .max(100, "Search must be 100 characters or fewer.").transform(value => value.trim());

export type MemberCreate = z.infer<typeof memberCreateSchema>;
export type MemberFieldErrors = Partial<Record<keyof MemberCreate | "password" | "confirmation", string>>;

export function memberFieldErrors(error: z.ZodError): MemberFieldErrors {
  const fields: MemberFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    // Only these schema-owned messages are public. Unknown keys and raw issues stay private.
    if (field === "fullName" || field === "confirmDuplicate" || field === "email" || field === "phone" || field === "password" || field === "confirmation") fields[field] ??= issue.message;
  }
  return fields;
}
