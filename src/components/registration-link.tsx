"use client";
import { useRef, useState } from "react";
import { Button } from "./ui/button";
type LinkData = { url: string; expiresAt: string; qr: string };
export function RegistrationLink({ initial }: { initial: LinkData | null }) {
  const [link, setLink] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const feedback = useRef<HTMLParagraphElement>(null);
  async function issue() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/registration-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "replace" }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setLink(result); setMessage("Registration link ready. Any previous link is now unavailable.");
    } catch { setMessage("Link update not confirmed. Reload this page to check the current link before sharing it."); }
    finally { setBusy(false); requestAnimationFrame(() => feedback.current?.focus()); }
  }
  return <section className="panel mt-6" aria-labelledby="registration-link-title"><h2 id="registration-link-title" className="panel-title">Reception registration QR</h2>
    <p className="mb-5 mt-2 max-w-2xl text-sm text-muted-foreground">Visitors save a Pending profile, then speak to reception for full cash activation. A registration link lasts 30 days. Replacing it invalidates the previous printed QR.</p>
    {link ? <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
      {/* Fixed black-on-white QR is machine-readable content in either theme. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={link.qr} width={180} height={180} alt="Reception registration QR" className="size-45 max-w-full shrink-0" />
      <div className="min-w-0 space-y-3"><a href={link.url} className="inline-block min-h-11 break-all py-2 text-sm underline">Open registration form</a>
        <p className="text-sm text-muted-foreground">Expires {new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(link.expiresAt))} PHT.</p>
        <a className="action-link" href={link.qr} download="reception-registration.png">Download reception QR</a></div>
    </div> : <p className="mb-4 text-sm text-muted-foreground">No active registration link.</p>}
    <div className="mt-5 flex flex-wrap items-center gap-3"><Button variant="outline" disabled={busy} onClick={issue}>{busy ? "Preparing link…" : link ? "Replace registration link" : "Create registration link"}</Button>
      <p className="text-sm text-muted-foreground">Local demonstration only. Phone access requires a verified reachable HTTPS environment.</p></div>
    <p ref={feedback} tabIndex={-1} role="status" className="mt-3 text-sm outline-offset-4">{message}</p>
  </section>;
}
