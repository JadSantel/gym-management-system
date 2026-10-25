"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { identityRequest, IdentityRequestError } from "@/lib/client";
import { setupFormSchema, identityFieldErrors, type IdentityFieldErrors } from "@/lib/identity-schema";
import { IdentityFeedback, type IdentityFeedbackState } from "@/components/identity-feedback";
export function SetupForm() {
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [feedback, setFeedback] = useState<IdentityFeedbackState>({ message: "", error: false });
  const [errors, setErrors] = useState<IdentityFieldErrors>({});
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    const changed = () => { if (window.location.hash) { setComplete(false); setFeedback({ message: "", error: false }); setErrors({}); setAttempted(false); } };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setAttempted(true); setFeedback({ message: "", error: false }); setErrors({});
    const element = event.currentTarget;
    const form = new FormData(element);
    try {
      const parsed = setupFormSchema.safeParse({ token: window.location.hash.slice(1), password: form.get("password"), confirmation: form.get("confirmation") });
      if (!parsed.success) { setErrors(identityFieldErrors(parsed.error)); setFeedback({ message: "Check the password fields and your invitation link.", error: true }); return; }
      await identityRequest("setup", { token: parsed.data.token, password: parsed.data.password });
      window.history.replaceState(null, "", "/setup");
      setComplete(true);
    } catch (error) {
      if (error instanceof IdentityRequestError) setErrors(error.fieldErrors);
      setFeedback({ message: error instanceof Error ? error.message : "Unable to connect. Try again.", error: true });
    } finally { element.reset(); setBusy(false); }
  }
  function correct(event: React.ChangeEvent<HTMLInputElement>) {
    if (!attempted) return;
    const form = new FormData(event.currentTarget.form!);
    const parsed = setupFormSchema.safeParse({ token: window.location.hash.slice(1), password: form.get("password"), confirmation: form.get("confirmation") });
    setErrors(parsed.success ? {} : identityFieldErrors(parsed.error));
  }
  return <div className="mx-auto max-w-md"><p className="mb-2 text-sm font-semibold text-primary">Private account setup</p>
    <h1 className="mb-3 text-3xl font-semibold tracking-tight">{complete ? "Your password is ready" : "Choose your password"}</h1>
    {complete ? <p>Setup is complete. <Link href="/login" className="underline">Sign in to continue</Link>.</p> : <>
      <p className="mb-8 text-muted-foreground">Use the invitation or recovery link sent to your email. Keep your password private.</p>
      <form noValidate onSubmit={submit} className="space-y-5 rounded-xl border border-border bg-card p-6" aria-busy={busy}>
        <IdentityFeedback id="setup-feedback" feedback={feedback} links={[
          ...(errors.password ? [{ id: "password", label: "Review new password" }] : []),
          ...(errors.confirmation ? [{ id: "confirmation", label: "Review password confirmation" }] : []),
        ]} />
        {errors.token && <p className="text-sm text-destructive">{errors.token}</p>}
        <label htmlFor="password">New password<Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} aria-invalid={!!errors.password} aria-describedby={`password-help${errors.password ? " password-error" : ""}`} required disabled={busy} onChange={correct} /></label>
        {errors.password && <p id="password-error" className="text-sm text-destructive">{errors.password}</p>}
        <p id="password-help" className="text-sm text-muted-foreground">Use 12–128 characters. Password managers and paste are supported.</p>
        <label htmlFor="confirmation">Confirm password<Input id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} aria-invalid={!!errors.confirmation} aria-describedby={errors.confirmation ? "confirmation-error" : undefined} required disabled={busy} onChange={correct} /></label>
        {errors.confirmation && <p id="confirmation-error" className="text-sm text-destructive">{errors.confirmation}</p>}
        <p className="text-sm text-muted-foreground">After an attempt, enter both passwords again. Passwords are never saved for retry.</p>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Save private password"}</Button>
        <Link href="/login" className="block text-sm underline">Back to sign in</Link>
      </form></>}
  </div>;
}
