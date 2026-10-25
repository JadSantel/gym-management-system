import { z } from "zod";

const emailMessage = "Enter a reserved .test email with at most 254 characters.";
const nameMessage = "Enter a name with 1–100 characters.";
const usernameMessage = "Use 3–30 letters, numbers, or underscores.";
const referenceMessage = "Choose a valid staff account.";
const email = z.string({ error: emailMessage }).min(1, emailMessage).max(254, emailMessage)
  .transform(value => value.trim().toLowerCase()).refine(value => /^[^\s@]+@[^\s@]+\.test$/.test(value), emailMessage);
const name = z.string({ error: nameMessage }).max(100, nameMessage).trim().min(1, nameMessage);
const username = z.string({ error: usernameMessage }).max(30, usernameMessage)
  .transform(value => value.trim().toLowerCase()).refine(value => /^[a-z0-9_]{3,30}$/.test(value), usernameMessage);
const operatorId = z.string({ error: referenceMessage })
  .length(36, referenceMessage)
  .regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, referenceMessage);
const passwordMessage = "Use a password with 12–128 characters.";
const password = z.string({ error: passwordMessage }).min(12, passwordMessage).max(128, passwordMessage);

export const identitySchemas = {
  setup: z.strictObject({
    token: z.string({ error: "Open the latest invitation or recovery link from your email." })
      .length(64, "Open the latest invitation or recovery link from your email.")
      .regex(/^[a-f0-9]{64}$/, "Open the latest invitation or recovery link from your email."),
    password,
  }),
  reauthenticate: z.strictObject({
    password: z.string({ error: "Enter your current password (at most 128 characters)." })
      .min(1, "Enter your current password.").max(128, "Enter at most 128 characters."),
  }),
  invite: z.strictObject({ email, name, username }),
  "reset-owner": z.strictObject({ email }),
  "reset-staff": z.strictObject({ operatorId }),
  disable: z.strictObject({ operatorId }),
  capabilities: z.strictObject({
    operatorId,
    canManageMembers: z.boolean({ error: "Choose the member permission explicitly." }),
    canCollectCash: z.boolean({ error: "Choose the cash permission explicitly." }),
  }),
};

export const identityReadActionSchema = z.enum(["session", "operators"]);
export const identityMutationActionSchema = z.enum(["setup", "reauthenticate", "invite", "reset-owner", "reset-staff", "disable", "capabilities"]);

export const setupFormSchema = identitySchemas.setup.extend({
  confirmation: password,
}).refine(value => value.password === value.confirmation, { path: ["confirmation"], message: "Passwords must match." });

export type StaffInvitation = z.infer<typeof identitySchemas.invite>;
export type StaffCapabilities = Pick<z.infer<typeof identitySchemas.capabilities>, "canManageMembers" | "canCollectCash">;
export type IdentityAction = keyof typeof identitySchemas;
export type IdentityFieldErrors = Partial<Record<keyof z.infer<typeof setupFormSchema> | keyof StaffInvitation
  | keyof z.infer<typeof identitySchemas.capabilities>, string>>;

export function identityFieldErrors(error: z.ZodError): IdentityFieldErrors {
  const fields: IdentityFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    // Return only schema-owned field messages, never unknown keys, inputs or raw issues.
    if (field === "token" || field === "password" || field === "confirmation" || field === "email" || field === "name"
        || field === "username" || field === "operatorId" || field === "canManageMembers" || field === "canCollectCash") {
      fields[field] ??= issue.message;
    }
  }
  return fields;
}
