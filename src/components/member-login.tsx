"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent } from "./ui/card";
import { IdentityFeedback, type IdentityFeedbackState } from "./identity-feedback";
import { identityRequest, IdentityRequestError } from "@/lib/client";
import { identitySchemas, identityFieldErrors } from "@/lib/identity-schema";

export function MemberLogin() {
  const router = useRouter();
  const [recovery, setRecovery] = useState(false), [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<IdentityFeedbackState>({ message: "", error: false });
  const [emailError, setEmailError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFeedback({ message: "", error: false }); setEmailError("");
    const element = event.currentTarget, form = new FormData(element);
    try {
      const parsed = identitySchemas["reset-owner"].safeParse({ email: form.get("email") });
      if (!parsed.success) { setEmailError(identityFieldErrors(parsed.error).email ?? "Check your email."); throw new Error("Check your member email below."); }
      if (recovery) {
        const result = await identityRequest("recover", parsed.data, "member");
        setFeedback({ message: result.status, error: false });
      } else {
        const response = await fetch("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: parsed.data.email, password: form.get("password") }) });
        if (!response.ok) throw new Error(response.status === 429 ? "Too many attempts. Wait one minute and try again." : "Unable to sign in. Check your member credentials or ask reception for help.");
        await identityRequest("dashboard", undefined, "member");
        router.replace("/member"); router.refresh();
      }
    } catch (error) {
      if (error instanceof IdentityRequestError) setEmailError(error.fieldErrors.email ?? "");
      setFeedback({ message: error instanceof Error ? error.message : "Unable to connect. Try again.", error: true });
    } finally {
      const password = element.querySelector<HTMLInputElement>('[name="password"]');
      if (password) password.value = "";
      setBusy(false);
    }
  }
  return <div className="mx-auto w-full max-w-md space-y-6">
    <div><h1 className="text-3xl font-semibold tracking-tight">{recovery ? "Recover member access" : "Your gym, your QR"}</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{recovery ? "Use the email verified when you set up your member login." : "Sign in to your member dashboard to view your membership and personal attendance QR."}</p></div>
    <Card className="shadow-none"><CardContent><form noValidate onSubmit={submit} className="space-y-5" aria-busy={busy}>
      <IdentityFeedback id="member-login-feedback" feedback={feedback} links={emailError ? [{ id: "member-email", label: "Review email" }] : []} />
      <div><label htmlFor="member-email">Member email</label><Input id="member-email" name="email" type="email" autoComplete="username" autoCapitalize="none" required maxLength={254} disabled={busy} aria-invalid={!!emailError} aria-describedby={emailError ? "member-email-error" : undefined} />{emailError && <p id="member-email-error" className="mt-1 text-sm text-destructive">{emailError}</p>}</div>
      {!recovery && <div><label htmlFor="member-password">Password</label><Input id="member-password" name="password" type="password" autoComplete="current-password" required maxLength={128} disabled={busy} /></div>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : recovery ? "Request member recovery" : "Sign in as member"}</Button>
      <Button variant="outline" className="w-full" disabled={busy} onClick={() => { setRecovery(!recovery); setFeedback({ message: "", error: false }); setEmailError(""); }}>{recovery ? "Back to member sign in" : "Forgot your password?"}</Button>
    </form></CardContent></Card>
    <p className="text-sm leading-relaxed text-muted-foreground">New member? Scan the registration QR at the front desk. After paid activation, reception can send your private setup link. Local synthetic demonstration; live email is not enabled.</p>
  </div>;
}
