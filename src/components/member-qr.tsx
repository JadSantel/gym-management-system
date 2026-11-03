"use client";
import { useRef, useState } from "react";
import { Button } from "./ui/button";
type Qr = { code: string; memberName: string; png: string };
export function MemberQr({ memberId, initial }: { memberId: string; initial: Qr | null }) {
  const [qr, setQr] = useState(initial), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [retry, setRetry] = useState(false);
  const pending = useRef<{ action: "issue" | "replace"; requestId: string } | null>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  async function issue(action: "issue" | "replace") {
    if (busy) return; setBusy(true);
    pending.current ??= { action, requestId: crypto.randomUUID() };
    try {
      const response = await fetch(`/api/members/${memberId}/qr`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pending.current) });
      const result = await response.json();
      if (!response.ok) { if (response.status < 500 && !retry) pending.current = null; setRetry(!!pending.current); setMessage(result.error); }
      else { setQr(result); pending.current = null; setRetry(false); setMessage(action === "replace" ? "Personal QR replaced. The previous code is now invalid." : "Personal QR ready. No new payment was recorded."); }
    } catch { setRetry(true); setMessage("QR action not confirmed. Retry the same action or reload to check the current QR before sharing it."); }
    finally { setBusy(false); requestAnimationFrame(() => feedback.current?.focus()); }
  }
  return <section className="panel space-y-5" aria-labelledby="personal-qr-title"><h2 id="personal-qr-title" className="panel-title">Personal member QR</h2>
    <p className="text-sm text-muted-foreground print:hidden">This code identifies the member record. Staff must confirm the person presenting it and check current server eligibility.</p>
    {qr ? <div id="member-qr-print" className="space-y-4">
      <p className="text-xl font-semibold">{qr.memberName}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr.png} alt="Personal member QR" width={240} height={240} className="max-w-full" />
      <p className="text-sm text-muted-foreground">Retain this QR across renewals. It contains no contact details or membership claims.</p>
      <div className="flex flex-wrap gap-3 print:hidden"><a href={qr.png} download="personal-member-qr.png" className="action-link">Download personal QR</a><Button variant="outline" onClick={() => window.print()}>Print personal QR</Button></div>
    </div> : <p className="text-sm">No personal QR issued. Current verified membership is required; eligible existing members do not need to pay again.</p>}
    <Button disabled={busy} variant="outline" className="print:hidden" onClick={() => issue(pending.current?.action ?? (qr ? "replace" : "issue"))}>{busy ? "Preparing QR…" : retry ? "Retry same QR action" : qr ? "Replace personal QR" : "Issue personal QR"}</Button>
    {qr && <p className="text-sm text-muted-foreground print:hidden">Replacement immediately invalidates the previous code.</p>}
    <p ref={feedback} tabIndex={-1} role="status" className="text-sm outline-offset-4 print:hidden">{message}</p>
  </section>;
}
