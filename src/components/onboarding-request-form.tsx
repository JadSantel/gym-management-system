"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { IdentityFeedback, type IdentityFeedbackState } from "@/components/identity-feedback";

export function OnboardingRequestForm() {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<IdentityFeedbackState>({ message: "", error: false });
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true); setErrors({}); setFeedback({ message: "", error: false });
    try {
      const form = new FormData(formElement);
      const response = await fetch("/api/onboarding-requests", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ gymName: form.get("gymName"), ownerName: form.get("ownerName"), email: form.get("email") }) });
      const result = await response.json();
      if (!response.ok) { setErrors(result.fieldErrors ?? {}); setFeedback({ message: result.error ?? "Request could not be submitted. Try again.", error: true }); return; }
      setFeedback({ message: result.status, error: false });
      formElement.reset();
    } catch {
      setFeedback({ message: "Unable to connect. Your request may not have been received; submit again if needed.", error: true });
    } finally { setBusy(false); }
  }

  const links = Object.keys(errors).map(id => ({ id, label: `Review ${id === "gymName" ? "gym name" : id === "ownerName" ? "owner name" : "email"}` }));
  // Adapted from shadcn/ui signup-03; password setup follows private approval.
  return <div data-auth-block="signup-03" className="flex flex-col gap-6"><Card>
    <CardHeader className="text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Request a gym account</h1>
      <CardDescription>Send a request for review. This form does not create an account or password.</CardDescription>
    </CardHeader>
    <CardContent>
      <form onSubmit={submit} aria-busy={busy}>
        <FieldGroup>
          <IdentityFeedback id="onboarding-request-feedback" feedback={feedback} links={links} />
          <Field>
            <FieldLabel htmlFor="gymName">Gym name</FieldLabel>
            <Input id="gymName" name="gymName" autoComplete="organization" required maxLength={100} disabled={busy} aria-invalid={!!errors.gymName} aria-describedby={errors.gymName ? "gymName-error" : undefined} />
            {errors.gymName && <p id="gymName-error" className="text-sm text-destructive">{errors.gymName}</p>}
          </Field>
          <Field>
            <FieldLabel htmlFor="ownerName">Your full name</FieldLabel>
            <Input id="ownerName" name="ownerName" autoComplete="name" required maxLength={100} disabled={busy} aria-invalid={!!errors.ownerName} aria-describedby={errors.ownerName ? "ownerName-error" : undefined} />
            {errors.ownerName && <p id="ownerName-error" className="text-sm text-destructive">{errors.ownerName}</p>}
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" required maxLength={254} disabled={busy} aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : "email-help"} />
            {errors.email ? <p id="email-error" className="text-sm text-destructive">{errors.email}</p> : <FieldDescription id="email-help">Synthetic local requests use a reserved .test email address.</FieldDescription>}
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Submitting request…" : "Submit request"}</Button>
          <FieldDescription className="text-center">Already have an account? <Link href="/login">Sign in</Link></FieldDescription>
        </FieldGroup>
      </form>
    </CardContent>
  </Card><FieldDescription className="px-6 text-center">After approval, you receive a private invitation to set up your owner account.</FieldDescription></div>;
}
