"use client";
import { useRef, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
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
  return <Card role="region" className="min-w-0 gap-0 rounded-lg" aria-labelledby="personal-qr-title"><CardHeader><h2 id="personal-qr-title" className="panel-title">Personal member QR</h2></CardHeader><CardContent className="space-y-5">
    <p className="text-sm text-muted-foreground print:hidden">Staff must confirm the person presenting this QR and check current membership access.</p>
    {qr && !retry && !busy ? <div id="member-qr-print" className="space-y-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr.png} alt="Personal member QR" width={240} height={240} className="mx-auto aspect-square h-auto max-w-full rounded-md" />
      <p className="break-words font-medium">{qr.memberName}</p>
    </div> : <p className="rounded-md bg-muted p-4 text-sm">{busy ? "Preparing personal QR…" : retry ? "Check the current QR before sharing. Retry the same action below or reload this page." : "No personal QR issued. Current verified membership is required; eligible existing members do not need to pay again."}</p>}
    <div className="flex flex-col gap-3 print:hidden">
      {qr && !retry && !busy && <a href={qr.png} download="personal-member-qr.png" className="action-link secondary w-full">Download QR</a>}
      {retry ? <Button disabled={busy} onClick={() => issue(pending.current!.action)}>{busy ? "Preparing QR…" : "Retry same QR action"}</Button> : qr ? <AlertDialog>
        <AlertDialogTrigger asChild><Button disabled={busy} variant="destructive" className="w-full">Replace personal QR</Button></AlertDialogTrigger>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Replace personal QR?</AlertDialogTitle><AlertDialogDescription>The previous code will stop working immediately. Give {qr.memberName} the new QR after replacement. Membership and payment records stay unchanged.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => issue("replace")}>Replace QR</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog> : <Button disabled={busy} variant="outline" onClick={() => issue("issue")}>{busy ? "Preparing QR…" : "Issue personal QR"}</Button>}
    </div>
    <p className="text-xs text-muted-foreground">Retain this QR across renewals. It identifies the member; it does not grant access by itself.</p>
    <p ref={feedback} tabIndex={-1} role="status" className="text-sm outline-offset-4 print:hidden">{message}</p>
  </CardContent></Card>;
}
