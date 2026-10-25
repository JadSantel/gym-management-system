"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IdentityFeedback, type IdentityFeedbackState } from "@/components/identity-feedback";
import { identityRequest, IdentityRequestError } from "@/lib/client";
import { identitySchemas, identityFieldErrors } from "@/lib/identity-schema";

export function ReauthenticationForm({ id, helpId, disabled = false }: { id: string; helpId: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [feedback, setFeedback] = useState<IdentityFeedbackState>({ message: "", error: false });
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setAttempted(true); setPasswordError(""); setFeedback({ message: "", error: false });
    try {
      const parsed = identitySchemas.reauthenticate.safeParse({ password: new FormData(form).get("password") });
      if (!parsed.success) {
        setPasswordError(identityFieldErrors(parsed.error).password ?? "");
        setFeedback({ message: "Check your password below.", error: true }); return;
      }
      await identityRequest("reauthenticate", parsed.data);
      setFeedback({ message: "Password verified for five minutes.", error: false });
    } catch (error) {
      if (error instanceof IdentityRequestError) setPasswordError(error.fieldErrors.password ?? (error.status === 401 ? "Unable to verify your password. Enter it again." : ""));
      setFeedback({ message: error instanceof Error ? error.message : "Unable to connect. Try again.", error: true });
    } finally { form.reset(); setBusy(false); }
  }
  return <form noValidate onSubmit={submit} className="flex flex-wrap items-end gap-3" aria-busy={busy}>
    <div className="w-full"><IdentityFeedback id={`${id}-feedback`} feedback={feedback}
      links={passwordError ? [{ id, label: "Review owner password" }] : []} /></div>
    <label htmlFor={id} className="min-w-48 grow">Owner password<Input id={id} name="password" type="password"
      autoComplete="current-password" required maxLength={128} disabled={busy || disabled}
      aria-invalid={!!passwordError} aria-describedby={`${helpId}${passwordError ? ` ${id}-error` : ""}`}
      onChange={event => { if (attempted) {
        const result = identitySchemas.reauthenticate.shape.password.safeParse(event.target.value);
        setPasswordError(result.success ? "" : result.error.issues[0].message);
      } }} /></label>
    <Button type="submit" disabled={busy || disabled}>{busy ? "Verifying…" : "Verify password"}</Button>
    {passwordError && <p id={`${id}-error`} className="w-full text-sm text-destructive">{passwordError}</p>}
  </form>;
}
