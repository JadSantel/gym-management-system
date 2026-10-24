import { z } from "zod";

const nameError = "Enter a member name with 1–100 visible characters.";
const memberNameSchema = z.string({ error: nameError }).min(1, nameError).max(100, nameError)
  .transform(value => value.normalize("NFKC").trim().replace(/\s+/g, " "))
  .refine(value => value.length >= 1 && value.length <= 100 && !/[\p{Cc}\p{Cf}]/u.test(value), nameError);

export const memberCreateSchema = z.strictObject({
  fullName: memberNameSchema,
  confirmDuplicate: z.boolean({ error: "Confirm duplicate review explicitly." }).default(false),
});
export const memberSearchSchema = z.string({ error: "Enter one member search of 100 characters or fewer." })
  .max(100, "Search must be 100 characters or fewer.").transform(value => value.trim());

export type MemberCreate = z.infer<typeof memberCreateSchema>;
export type MemberFieldErrors = Partial<Record<keyof MemberCreate, string>>;

export function memberFieldErrors(error: z.ZodError): MemberFieldErrors {
  const fields: MemberFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    // Only these schema-owned messages are public. Unknown keys and raw issues stay private.
    if (field === "fullName" || field === "confirmDuplicate") fields[field] ??= issue.message;
  }
  return fields;
}
