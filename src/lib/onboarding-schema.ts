import { z } from "zod";

const text = (max: number) => z.string().trim().min(1, "This field is required.").max(max, `Use at most ${max} characters.`);

export const onboardingRequestSchema = z.strictObject({
  gymName: text(100),
  ownerName: text(100),
  email: z.email("Enter a valid email address.").max(254).transform(value => value.trim().toLowerCase())
    .refine(value => /^[^\s@]+@[^\s@]+\.test$/.test(value), "Use a reserved synthetic .test email address."),
});

export const onboardingDecisionSchema = z.strictObject({
  requestId: z.uuid(),
  decision: z.enum(["APPROVE", "DECLINE"]),
  syntheticOwnershipVerified: z.boolean(),
}).refine(value => value.decision !== "APPROVE" || value.syntheticOwnershipVerified, {
  path: ["syntheticOwnershipVerified"],
  message: "Confirm the synthetic ownership review before approval.",
});

export const onboardingRetrySchema = z.strictObject({ requestId: z.uuid() });
