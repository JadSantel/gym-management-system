"use client";
import { useRef, useState } from "react";
import { registrationSchema, memberFieldErrors, type MemberFieldErrors } from "@/lib/member-schema";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ContactFields } from "./contact-fields";
import type { z } from "zod";
export function RegistrationForm({ code }: { code: string }) {
  const [errors, setErrors] = useState<MemberFieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const feedback = useRef<HTMLDivElement>(null);
  const pending = useRef<z.infer<typeof registrationSchema> | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget); setErrors({}); setMessage("");
    const parsed = registrationSchema.safeParse(pending.current ?? { fullName: form.get("fullName"), email: form.get("email"), phone: form.get("phone"), requestId: crypto.randomUUID() });
    if (!parsed.success) { setErrors(memberFieldErrors(parsed.error)); setMessage("Check the highlighted details."); requestAnimationFrame(() => feedback.current?.focus()); return; }
    pending.current = parsed.data; setBusy(true);
    try {
      const response = await fetch(`/api/join/${code}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pending.current) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 400) { pending.current = null; setUncertain(false); }
        else setUncertain(true);
        if (response.status === 410) setStatus("UNAVAILABLE");
        setErrors(result.fieldErrors ?? {}); setMessage(result.error ?? "Unable to submit. Please speak to reception.");
      } else if (result.status === "PENDING" || result.status === "RECEPTION") { setStatus(result.status); setUncertain(false); }
      else throw new Error("Unexpected response");
    } catch { setUncertain(true); setMessage("Registration not confirmed. Retry the same submission when connected, or speak to reception."); }
    finally { setBusy(false); requestAnimationFrame(() => feedback.current?.focus()); }
  }
  if (status === "PENDING" || status === "RECEPTION") return <div ref={feedback} tabIndex={-1} role="status" className="space-y-4 outline-offset-4">
    <h2 className="text-xl font-semibold">{status === "PENDING" ? "Your profile is saved" : "Please speak to reception"}</h2>
    <p>{status === "PENDING" ? "Your membership is Pending. Reception can review your details and take your full cash payment." : "We could not create another profile with these contact details. Reception can help you continue."}</p>
    <p className="text-muted-foreground">Registration grants no paid access. No payment has been recorded.</p>
  </div>;
  return <form noValidate onSubmit={submit} className="space-y-6" aria-busy={busy}>
    <div ref={feedback} role="alert" tabIndex={-1} className={message ? "rounded-md bg-attention-surface p-4 text-sm text-attention outline-offset-4" : "sr-only"}>{message}</div>
    <div><label htmlFor="join-name">Full name</label><Input id="join-name" name="fullName" autoComplete="name" maxLength={100} required disabled={busy || uncertain || !!status}
      aria-invalid={!!errors.fullName} aria-describedby={errors.fullName ? "join-name-error" : undefined} />
      {errors.fullName && <p id="join-name-error" className="mt-1 text-sm text-destructive">{errors.fullName}</p>}</div>
    <ContactFields prefix="join" errors={errors} required disabled={busy || uncertain || !!status} />
    <p className="text-sm text-muted-foreground">These details are saved for reception to manage your member profile. Membership starts through a separately verified full cash payment.</p>
    <Button type="submit" className="w-full" disabled={busy || !!status}>{busy ? "Saving your profile…" : uncertain ? "Retry same submission" : "Save my profile"}</Button>
    <p className="text-sm text-muted-foreground">Already registered or need help? Speak to reception.</p>
  </form>;
}
