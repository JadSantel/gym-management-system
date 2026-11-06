"use client";
import { useRef, useState } from "react";
import { Button } from "./ui/button";
type LinkData = { url: string; expiresAt: string; qr: string };
export function RegistrationLink({ initial }: { initial: LinkData | null }) {
  const [link, setLink] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState("");
  const feedback = useRef<HTMLParagraphElement>(null);
  async function issue() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/registration-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "replace" }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setLink(result); setMessage("Registration link ready. Any previous link is now unavailable.");
    } catch { setUncertain(true); setMessage("Link update not confirmed. Reload this page to check the current link before sharing it."); }
    finally { setBusy(false); requestAnimationFrame(() => feedback.current?.focus()); }
  }
  return <section id="registration-link" className="panel mt-6 scroll-mt-6" aria-labelledby="registration-link-title">
    <div className="grid min-w-0 items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(240px,320px)] md:gap-10">
      <div><h2 id="registration-link-title" className="text-2xl font-semibold tracking-tight text-balance">New here? Scan to join.</h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">Use your phone camera to scan this reception registration QR and save your details. Then see the front desk to activate your membership.</p>
        <ol className="mt-6 grid gap-4 text-sm">
          {["Register and choose your password on your phone", "Pay in full and activate at the front desk", "Sign in to view or download your personal QR"].map((step, index) => <li key={step} className="flex items-center gap-3"><span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-xs tabular-nums">{index + 1}</span>{step}</li>)}
        </ol>
        <p className="mt-5 text-sm text-muted-foreground">Registration saves a Pending profile. It grants no gym access and records no payment.</p>
      </div>
      {link && !busy && !uncertain ? <div className="flex min-w-0 flex-col items-center gap-3 text-center">
      {/* Fixed black-on-white QR is machine-readable content in either theme. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={link.qr} width={280} height={280} alt="Reception registration QR" className="h-auto w-70 max-w-full rounded-md" />
        <a href={link.url} className="inline-flex min-h-11 items-center py-2 text-sm underline underline-offset-4">Open registration form</a>
        <a className="action-link" href={link.qr} download="reception-registration.png">Download reception QR</a>
        <p className="text-xs text-muted-foreground">Expires {new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(link.expiresAt))} PHT.</p>
      </div> : <p className="text-sm text-muted-foreground">{busy ? "Preparing registration QR…" : uncertain ? "Reload to confirm the current registration QR before sharing it." : "No active registration link. Create one below to let visitors register on their phones."}</p>}
    </div>
    <div className="mt-6 border-t border-border pt-5"><p className="mb-4 text-sm text-muted-foreground">A registration link lasts 30 days. Replacing it invalidates the previous printed QR.</p>
    <div className="flex flex-wrap items-center gap-3">{uncertain ? <Button variant="outline" onClick={() => window.location.reload()}>Reload registration QR</Button> : <Button variant="outline" disabled={busy} onClick={issue}>{busy ? "Preparing link…" : link ? "Replace registration link" : "Create registration link"}</Button>}
      <p className="text-sm text-muted-foreground">Local demonstration only. Phone access requires a verified reachable HTTPS environment.</p></div>
    <p ref={feedback} tabIndex={-1} role="status" className="mt-3 text-sm outline-offset-4">{message}</p>
    </div>
  </section>;
}
