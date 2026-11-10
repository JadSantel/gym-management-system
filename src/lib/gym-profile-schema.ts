import { z } from "zod";

export const gymProfileSchema = z.strictObject({
  name: z.string().trim().min(1, "Enter the gym name.").max(120, "Use at most 120 characters."),
  contactEmail: z.union([z.email({ error: "Enter a valid contact email address." }).max(254), z.literal("")]),
  phone: z.string().trim().max(30, "Use at most 30 characters.").regex(/^[+\d\s().-]*$/, "Use digits, spaces, +, parentheses or hyphens."),
  address: z.string().trim().max(500, "Use at most 500 characters."),
  profileTimezone: z.string().trim().max(100).refine(value => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
  }, "Choose a valid timezone, such as Asia/Manila."),
  profileCountry: z.string().trim().min(1, "Enter the country.").max(80, "Use at most 80 characters."),
  profileCurrency: z.string().refine(value => Intl.supportedValuesOf("currency").includes(value), "Choose a supported currency code."),
  profileVersion: z.number().int().min(1).max(2_147_483_646),
});
export type GymProfile = z.infer<typeof gymProfileSchema>;
export function gymProfileErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}
