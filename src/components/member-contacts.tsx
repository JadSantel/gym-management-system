"use client";
import { useRef, useState } from "react";
import { contactSchema, memberFieldErrors, type MemberFieldErrors } from "@/lib/member-schema";
import { Button } from "./ui/button";
import { ContactFields } from "./contact-fields";
export function MemberContacts({ id, email, phone, source }: { id: string; email: string | null; phone: string | null; source: string }) {
  const [errors, setErrors] = useState<MemberFieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const feedback = useRef<HTMLParagraphElement>(null);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setErrors({});
    const parsed = contactSchema.safeParse({ email: form.get("email"), phone: form.get("phone") });
    if (!parsed.success) { setErrors(memberFieldErrors(parsed.error)); setMessage("Check the contact fields."); requestAnimationFrame(() => feedback.current?.focus()); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/members/${id}/contacts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json(); if (!response.ok) { setErrors(result.fieldErrors ?? {}); throw new Error(result.error); }
      setMessage("Contacts saved as unverified.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Save not confirmed. Retry or reload to check the recorded contacts."); }
    finally { setBusy(false); requestAnimationFrame(() => feedback.current?.focus()); }
  }
  return <section className="panel mt-4" aria-labelledby="contact-title"><h2 id="contact-title" className="panel-title">Contact details</h2>
    <p className="mb-5 mt-2 text-sm text-muted-foreground">Source: {source === "PUBLIC_REGISTRATION" ? "Public registration" : "Staff entry"}. Missing contacts are not recorded.</p>
    <form noValidate onSubmit={save} className="space-y-4" aria-busy={busy}><ContactFields prefix="profile" email={email} phone={phone} errors={errors} disabled={busy} />
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save contacts"}</Button><p ref={feedback} tabIndex={-1} role="status" className="text-sm outline-offset-4">{message}</p></form>
  </section>;
}
