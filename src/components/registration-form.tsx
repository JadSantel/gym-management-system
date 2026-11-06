"use client";
import { useEffect, useRef, useState } from "react";
import { registrationSchema, memberFieldErrors, type MemberFieldErrors } from "@/lib/member-schema";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ContactFields } from "./contact-fields";
import { Badge } from "./ui/badge";
import Link from "next/link";
import type { z } from "zod";
export function RegistrationForm({ code }: { code: string }) {
  const [errors, setErrors] = useState<MemberFieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const feedback = useRef<HTMLDivElement>(null);
  const pending = useRef<z.infer<typeof registrationSchema> | null>(null);
  useEffect(() => {
    if (status === "PENDING" || status === "RECEPTION") feedback.current?.focus();
  }, [status]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const element = event.currentTarget, form = new FormData(element); setErrors({}); setMessage("");
    const parsed = registrationSchema.safeParse(pending.current ?? { fullName: form.get("fullName"), email: form.get("email"), phone: form.get("phone"),
      password: form.get("password"), confirmation: form.get("confirmation"), requestId: crypto.randomUUID() });
    if (!parsed.success) { setErrors(memberFieldErrors(parsed.error)); setMessage("Check the highlighted details."); requestAnimationFrame(() => feedback.current?.focus()); return; }
    pending.current = parsed.data; setBusy(true);
    try {
      const response = await fetch(`/api/join/${code}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pending.current) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 400) { pending.current = null; setUncertain(false); }
        else setUncertain(true);
        if (response.status === 410) { pending.current = null; element.reset(); setShowPassword(false); setStatus("UNAVAILABLE"); }
        setErrors(result.fieldErrors ?? {}); setMessage(result.error ?? "Unable to submit. Please speak to reception.");
      } else if (result.status === "PENDING" || result.status === "RECEPTION") { pending.current = null; element.reset(); setShowPassword(false); setStatus(result.status); setUncertain(false); }
      else throw new Error("Unexpected response");
    } catch { setUncertain(true); setMessage("Registration not confirmed. Retry the same submission when connected, or speak to reception."); }
    finally { setBusy(false); requestAnimationFrame(() => feedback.current?.focus()); }
  }
  if (status === "PENDING" || status === "RECEPTION") return <div ref={feedback} tabIndex={-1} role="status" className="space-y-4 outline-offset-4">
    <h2 className="text-xl font-semibold">{status === "PENDING" ? "Your profile is saved" : "Please speak to reception"}</h2>
    {status === "PENDING" && <Badge variant="outline" className="border-transparent bg-attention-surface text-attention">Pending activation</Badge>}
    <p>{status === "PENDING" ? "Your membership is Pending. Reception can review your details and take your full cash payment." : "We could not create another profile with these contact details. Reception can help you continue."}</p>
    {status === "PENDING" && <div className="space-y-4 border-t border-border pt-4"><h3 className="font-medium">What happens next?</h3><ol className="list-decimal space-y-3 pl-5 text-sm"><li>Your member login is ready. Sign in with your email and the password you just chose.</li><li>See the front desk to choose a plan and pay in full with cash.</li><li>After paid activation, refresh your dashboard to view or download your personal QR. Show it to staff when you arrive and leave.</li></ol><Link href="/member/login" className="action-link">Sign in to my dashboard</Link></div>}
    <p className="text-muted-foreground">Registration grants no paid access. No payment has been recorded.</p>
  </div>;
  return <form noValidate onSubmit={submit} className="space-y-6" aria-busy={busy}>
    <div ref={feedback} role="alert" tabIndex={-1} className={message ? "rounded-md bg-attention-surface p-4 text-sm text-attention outline-offset-4" : "sr-only"}>{message}</div>
    <div><label htmlFor="join-name">Full name</label><Input id="join-name" name="fullName" autoComplete="name" maxLength={100} required disabled={busy || uncertain || !!status}
      aria-invalid={!!errors.fullName} aria-describedby={errors.fullName ? "join-name-error" : undefined} />
      {errors.fullName && <p id="join-name-error" className="mt-1 text-sm text-destructive">{errors.fullName}</p>}</div>
    <ContactFields prefix="join" errors={errors} required disabled={busy || uncertain || !!status} />
    <div className="space-y-4 border-t border-border pt-5">
      <div><label htmlFor="join-password">Password</label><Input id="join-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy || uncertain || !!status}
        aria-invalid={!!errors.password} aria-describedby={`join-password-help${errors.password ? " join-password-error" : ""}`} />
        <p id="join-password-help" className="mt-2 text-sm text-muted-foreground">Use 12–128 characters. You will use this password to sign in to your member dashboard.</p>
        {errors.password && <p id="join-password-error" className="mt-1 text-sm text-destructive">{errors.password}</p>}</div>
      <div><label htmlFor="join-confirmation">Confirm password</label><Input id="join-confirmation" name="confirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy || uncertain || !!status}
        aria-invalid={!!errors.confirmation} aria-describedby={errors.confirmation ? "join-confirmation-error" : undefined} />
        {errors.confirmation && <p id="join-confirmation-error" className="mt-1 text-sm text-destructive">{errors.confirmation}</p>}</div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={showPassword} onChange={event => setShowPassword(event.target.checked)} disabled={busy || uncertain || !!status} className="size-4 accent-primary" />Show passwords</label>
    </div>
    <p className="text-sm text-muted-foreground">These details are saved for reception to manage your member profile. Membership starts through a separately verified full cash payment.</p>
    <Button type="submit" className="w-full" disabled={busy || !!status}>{busy ? "Saving your profile…" : uncertain ? "Retry same submission" : "Save my profile"}</Button>
    <p className="text-sm text-muted-foreground">Already registered? <Link href="/member/login" className="underline underline-offset-4">Sign in</Link> or speak to reception.</p>
  </form>;
}
