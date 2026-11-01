"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { identityRequest, IdentityRequestError } from "@/lib/client";
import { identitySchemas, identityFieldErrors } from "@/lib/identity-schema";
import { IdentityFeedback, type IdentityFeedbackState } from "@/components/identity-feedback";

export function LoginForm({ signedOut = false }: { signedOut?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(signedOut ? "You are signed out." : "");
  const [recovery, setRecovery] = useState(false);
  const [feedback, setFeedback] = useState<IdentityFeedbackState>({ message: "", error: false });
  const [emailError, setEmailError] = useState("");
  const [attempted, setAttempted] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setFeedback({ message: "", error: false }); setEmailError("");
    const element = event.currentTarget;
    const form = new FormData(element);
    try {
      if (recovery) {
        setAttempted(true);
        const parsed = identitySchemas["reset-owner"].safeParse({ email: form.get("identifier") });
        if (!parsed.success) { setEmailError(identityFieldErrors(parsed.error).email ?? ""); setFeedback({ message: "Check your email below.", error: true }); return; }
        const result = await identityRequest("reset-owner", parsed.data);
        setFeedback({ message: result.status, error: false });
      } else {
        const response = await fetch(`/api/auth/sign-in/${mode}`, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ [mode]: form.get("identifier"), password: form.get("password") }) });
        if (!response.ok) throw new Error(response.status === 429 ? "Too many attempts. Wait one minute and try again." : "Unable to sign in. Check your credentials or contact your owner.");
        router.replace("/"); router.refresh();
      }
    } catch (error) {
      if (error instanceof IdentityRequestError) setEmailError(error.fieldErrors.email ?? "");
      setFeedback({ message: error instanceof Error ? error.message : "Unable to connect. Try again.", error: true });
    } finally {
      const password = element.querySelector<HTMLInputElement>('input[name="password"]');
      if (password) password.value = "";
      setBusy(false);
    }
  }
  return <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
    <Card>
      <CardHeader>
        <h1 className="text-2xl font-semibold tracking-tight">{recovery ? "Recover owner access" : "Sign in to your gym"}</h1>
        <CardDescription>{recovery ? "Use the verified email attached to your owner account." : "Use your individual account. Your access belongs to one gym."}</CardDescription>
      </CardHeader>
      <CardContent>
    <form noValidate={recovery} onSubmit={submit} aria-busy={busy}>
      <FieldGroup>
      <IdentityFeedback id="identity-login-feedback" feedback={feedback} links={emailError ? [{ id: "identifier", label: "Review email" }] : []} />
      {!recovery && <fieldset disabled={busy}><legend className="mb-2 text-sm font-semibold">Account type</legend><div className="grid grid-cols-2 gap-3">
        {[["email", "Owner"], ["username", "Staff"]].map(([value, label]) => <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 ${mode === value ? "border-primary bg-muted" : "border-border"}`}><input type="radio" name="mode" value={value} checked={mode === value} onChange={() => { setMode(value); setMessage(""); setFeedback({ message: "", error: false }); }} />{label}</label>)}
      </div></fieldset>}
      <Field>
      <FieldLabel htmlFor="identifier">{mode === "email" || recovery ? "Email" : "Username"}</FieldLabel><Input key={mode} id="identifier" name="identifier" type={mode === "email" || recovery ? "email" : "text"} autoComplete="username" autoCapitalize="none" required maxLength={254} disabled={busy}
        aria-invalid={!!emailError} aria-describedby={emailError ? "recovery-email-error" : undefined} onChange={event => {
          if (recovery && attempted) { const result = identitySchemas["reset-owner"].shape.email.safeParse(event.target.value); setEmailError(result.success ? "" : result.error.issues[0].message); }
        }} />
      {emailError && <p id="recovery-email-error" className="text-sm text-destructive">{emailError}</p>}
      </Field>
      {!recovery && <Field>
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <FieldLabel htmlFor="password">Password</FieldLabel>
          {mode === "email" && <button type="button" disabled={busy} className="min-h-11 text-sm underline-offset-4 hover:underline disabled:opacity-60" onClick={() => { setRecovery(true); setMessage(""); setEmailError(""); setAttempted(false); setFeedback({ message: "", error: false }); }}>Forgot your password?</button>}
        </div>
        <Input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} disabled={busy} />
      </Field>}
      <Field>
      <p id="login-result" role="status" className={`text-sm text-muted-foreground ${message ? "" : "sr-only"}`}>{message}</p>
      <Button type="submit" disabled={busy} className="w-full">{busy ? "Please wait…" : recovery ? "Request recovery link" : "Sign in"}</Button>
      {recovery && <Button variant="outline" disabled={busy} className="w-full" onClick={() => { setRecovery(false); setMessage(""); setEmailError(""); setAttempted(false); setFeedback({ message: "", error: false }); }}>Back to sign in</Button>}
      {mode === "username" && <FieldDescription>For password recovery, ask your gym owner to send a reset link.</FieldDescription>}
      </Field>
      </FieldGroup>
    </form>
      </CardContent>
    </Card>
    <p className="text-center text-sm text-muted-foreground">Accounts are invitation only. Ask your owner or platform contact if you need access.</p>
  </div>;
}
