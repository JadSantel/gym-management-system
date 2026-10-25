"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReauthenticationForm } from "./reauthentication-form";
import { digitalCommandSchema, digitalConfirmationSchema, digitalFieldErrors, type DigitalCommand } from "@/lib/digital-schema";
import { formatPhp, pesoInput } from "@/lib/money";

type Account = { id: string; label: string; method: string };
type Claim = { id: string; accountId: string; amountCentavos: number; transactionReference: string; reportedReceivedAt: string; enteredAt: string; collector: string;
  memberId: string; memberName: string; requiredCentavos: number; startsAt: string; endsAt: string };
export type DigitalView = { accounts: Account[]; operators: { id: string; name: string }[]; claims: Claim[];
  grants: { accountId: string; operatorId: string; active: boolean }[];
  settlements: { claimId: string; paymentId: string; receiptId: string; evidenceReference: string }[];
  flags: { id: string; paymentId: string; reason: string }[]; owner: boolean; operatorId: string; recoveryScope: string };
const recoverySchema = z.strictObject({ key: z.uuid(), command: digitalConfirmationSchema });
type Recovery = z.infer<typeof recoverySchema>;
const selectStyle = "min-h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const pht = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
function commandFromForm(form: HTMLFormElement) {
  const values: Record<string, unknown> = Object.fromEntries(new FormData(form));
  if (values.action === "verifier") values.active = values.active === "true";
  if (values.action === "confirm") values.accountMatched = values.accountMatched === "on";
  for (const key of ["receivedAt", "reportedReceivedAt"]) {
    if (typeof values[key] === "string" && values[key]) {
      const time = new Date(`${values[key]}+08:00`);
      values[key] = Number.isNaN(time.getTime()) ? "" : time.toISOString();
    }
  }
  return digitalCommandSchema.safeParse(values);
}

export function DigitalClaimForm({ chargeId, amountCentavos, accounts }: { chargeId: string; amountCentavos: number; accounts: Account[] }) {
  const router = useRouter(); const busyRef = useRef(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({}); const feedback = useRef<HTMLParagraphElement>(null);
  const field = (name: string) => ({ "aria-invalid": !!errors[name], "aria-describedby": "claim-feedback" });
  return <section className="mt-7 rounded-xl border border-border bg-card p-6" aria-labelledby="digital-claim-title">
    <h2 id="digital-claim-title" className="text-xl font-semibold">Record transfer claim</h2>
    <p className="mt-2 text-sm text-muted-foreground">GCash and bank claims stay pending. Screenshots grant no new access. Enter references only; never passwords, OTPs or banking credentials.</p>
    <p id="claim-feedback" ref={feedback} tabIndex={-1} role="status" className="mt-3 text-sm">{message}</p>
    {accounts.length ? <form className="mt-4" aria-busy={busy} onSubmit={async event => {
      event.preventDefault(); if (busyRef.current) return; const form = event.currentTarget;
      busyRef.current = true; setBusy(true); setMessage(""); setErrors({});
      try {
        const parsed = commandFromForm(form);
        if (!parsed.success) { setErrors(digitalFieldErrors(parsed.error)); throw new Error("Check the transfer claim fields below."); }
        const response = await fetch("/api/digital", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
        const body = await response.json();
        if (!response.ok) { setErrors(body.fieldErrors ?? {}); throw new Error(body.error); }
        setMessage("Transfer claim recorded. Pending verification; no new membership access granted."); router.refresh();
      } catch (error) { setMessage(error instanceof Error ? error.message : "Connection unavailable. Reload to check this claim before retrying."); }
      finally { busyRef.current = false; setBusy(false); feedback.current?.focus(); }
    }}>
      <input type="hidden" name="action" value="claim" /><input type="hidden" name="chargeId" value={chargeId} />
      <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2"><legend className="sr-only">Pending transfer details</legend>
        <label>Designated receiving account<select name="accountId" className={selectStyle} required {...field("accountId")}>{accounts.map(account => <option key={account.id} value={account.id}>{account.method} · {account.label}</option>)}</select></label>
        <label>Claimed amount (PHP)<Input name="amount" inputMode="decimal" defaultValue={pesoInput(amountCentavos)} required {...field("amount")} /></label>
        <label>Transaction reference<Input name="transactionReference" maxLength={100} required {...field("transactionReference")} /></label>
        <label>Reported transfer time (PHT)<Input name="reportedReceivedAt" type="datetime-local" step="1" required {...field("reportedReceivedAt")} /></label>
        <Button type="submit">{busy ? "Recording…" : "Record pending transfer"}</Button>
      </fieldset>
    </form> : <p className="mt-4">Ask the owner to designate a synthetic receiving account first.</p>}
    <Link href="/digital" className="mt-4 inline-block underline">Open digital verification queue</Link>
  </section>;
}

export function DigitalPayments({ data }: { data: DigitalView }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [message, setMessage] = useState(""); const [errors, setErrors] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false); const [pending, setPending] = useState<Recovery | null>(null);
  const pendingRef = useRef<Recovery | null>(null); const feedback = useRef<HTMLParagraphElement>(null);
  const storageKey = `digital-recovery:${data.recoveryScope}`;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const raw = sessionStorage.getItem(storageKey); if (raw) { const value = recoverySchema.parse(JSON.parse(raw)); pendingRef.current = value; setPending(value); } setReady(true); }
      catch { setMessage("Recovery storage is unavailable or invalid. Restore this tab's saved operation before confirming another transfer."); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);
  const field = (name: string) => ({ "aria-invalid": !!errors[name], "aria-describedby": "digital-feedback" });
  async function send(command: DigitalCommand, recovery?: Recovery) {
    if (busyRef.current || !ready) return;
    busyRef.current = true; setBusy(true); setMessage(""); setErrors({});
    try {
      let operation = recovery;
      if (command.action === "confirm") {
        if (pendingRef.current && !recovery) throw new Error("Resolve the original confirmation first.");
        operation ??= { key: crypto.randomUUID(), command };
        sessionStorage.setItem(storageKey, JSON.stringify(operation)); pendingRef.current = operation; setPending(operation);
      }
      const response = await fetch("/api/digital", { method: "POST", headers: { "content-type": "application/json", ...(operation ? { "idempotency-key": operation.key } : {}) }, body: JSON.stringify(command) });
      const body = await response.json();
      if (!response.ok) {
        if (response.headers.get("digital-confirmation-outcome") === "not-confirmed") { sessionStorage.removeItem(storageKey); pendingRef.current = null; setPending(null); }
        setErrors(body.fieldErrors ?? {}); throw new Error(body.error);
      }
      if (operation) { sessionStorage.removeItem(storageKey); pendingRef.current = null; setPending(null); }
      setMessage(command.action === "confirm" ? "Digital funds confirmed. Open the linked receipt below." : command.action === "flag" ? "Flagged for owner review. Payment history and membership access are preserved." : "Saved.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connection unavailable. Retry the original confirmation; do not record another collection."); }
    finally { busyRef.current = false; setBusy(false); feedback.current?.focus(); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busyRef.current || !ready) return;
    const parsed = commandFromForm(event.currentTarget);
    if (!parsed.success) { setErrors(digitalFieldErrors(parsed.error)); setMessage("Check the fields below. Confirm only actual full funds in the designated receiving account."); feedback.current?.focus(); return; }
    await send(parsed.data);
  }
  return <>
    <p id="digital-feedback" ref={feedback} tabIndex={-1} role="status" className="mt-5 break-words text-sm">{message}</p>
    {pending && <section className="mt-4 rounded-lg border border-border p-4" aria-label="Unresolved digital confirmation"><p>Confirmation status unknown. Do not collect again. Retry the saved operation to retrieve its original result.</p><p className="mt-2 break-all text-sm">Claim: {pending.command.claimId}</p><Button className="mt-3" disabled={busy || !ready} onClick={() => send(pending.command, pending)}>Retry original digital confirmation</Button></section>}
    <section className="mt-7" aria-labelledby="digital-queue-title"><h2 id="digital-queue-title" className="text-xl font-semibold">Transfer verification queue</h2>
      <p className="mt-2 text-sm text-muted-foreground">Check actual receiving-account funds outside this app. Pending claims grant no new access; existing paid access stays independent. If no verifier is available, leave pending and contact the owner. Cross-date transfers stay pending for owner review.</p>
      {!data.claims.length && <p className="mt-4">No transfer claims recorded. Prepare a charge on a member page to record one.</p>}
      <ol className="mt-5 space-y-5">{data.claims.map(claim => {
        const settlement = data.settlements.find(row => row.claimId === claim.id);
        const account = data.accounts.find(row => row.id === claim.accountId)!;
        const canVerify = data.grants.some(row => row.accountId === claim.accountId && row.operatorId === data.operatorId && row.active);
        return <li key={claim.id} className="rounded-xl border border-border bg-card p-5" data-claim={claim.id}>
          <h3 className="text-lg font-semibold"><Link href={`/members/${claim.memberId}`} className="underline">{claim.memberName}</Link> · {settlement ? "Confirmed" : "Pending verification"}</h3>
          <p className="mt-2">{account.method} · {account.label} · claimed {formatPhp(claim.amountCentavos)} · required {formatPhp(claim.requiredCentavos)}</p>
          <p className="mt-2 break-all text-sm">Transfer reference: {claim.transactionReference}</p>
          <p className="mt-2 text-sm">Reported received: {pht.format(new Date(claim.reportedReceivedAt))} PHT. Entered: {pht.format(new Date(claim.enteredAt))} PHT. Collector: {claim.collector}.</p>
          <p className="mt-2 text-sm">Reviewed proposed period: {pht.format(new Date(claim.startsAt))} PHT inclusive to {pht.format(new Date(claim.endsAt))} PHT exclusive.</p>
          {settlement ? <>
            <p className="mt-3"><Link className="underline" href={`/receipts/${settlement.receiptId}`}>View digital receipt</Link></p>
            <p className="mt-2 break-all text-sm">Matched account evidence reference: {settlement.evidenceReference}</p>
            {data.flags.filter(row => row.paymentId === settlement.paymentId).map(flag => <p key={flag.id} className="mt-2 font-semibold">Owner review required: {flag.reason}. No automatic refund or access change.</p>)}
            <form onSubmit={submit} className="mt-4"><input type="hidden" name="action" value="flag" /><input type="hidden" name="paymentId" value={settlement.paymentId} />
              <fieldset disabled={busy || !ready} className="flex min-w-0 flex-wrap items-end gap-3"><legend className="sr-only">Flag confirmed transfer for owner review</legend>
                <label className="min-w-0 grow">Review reason<select name="reason" className={selectStyle}><option value="DISPUTED">Disputed</option><option value="REVERSED">Reversed</option><option value="MISSING">Apparently missing</option></select></label><Button type="submit">Flag for owner review</Button>
              </fieldset></form>
          </> : canVerify ? <form onSubmit={submit} className="mt-5 border-t border-border pt-4">
            <input type="hidden" name="action" value="confirm" /><input type="hidden" name="claimId" value={claim.id} />
            <fieldset disabled={busy || !ready || !!pending} className="grid min-w-0 gap-4 sm:grid-cols-2"><legend className="mb-3 font-semibold">Confirm received funds</legend>
              <label>Matched receiving account<select name="accountId" className={selectStyle} defaultValue={claim.accountId} required {...field("accountId")}>{data.accounts.map(row => <option key={row.id} value={row.id}>{row.method} · {row.label}</option>)}</select></label>
              <label>Actual full amount (PHP)<Input name="amount" inputMode="decimal" required {...field("amount")} /></label>
              <label>Actual transaction reference<Input name="transactionReference" maxLength={100} required {...field("transactionReference")} /></label>
              <label>Actual funds received at (PHT)<Input name="receivedAt" type="datetime-local" step="1" required {...field("receivedAt")} /></label>
              <label>Account activity evidence reference<Input name="evidenceReference" maxLength={100} required {...field("evidenceReference")} /></label>
              <label className="flex items-center gap-3"><input type="checkbox" name="accountMatched" required className="size-5" {...field("accountMatched")} />I checked actual funds in the designated account.</label>
              <Button type="submit">{busy ? "Confirming…" : "Confirm full digital funds"}</Button>
            </fieldset>
          </form> : <p className="mt-4 text-sm">{pending ? "Resolve the original confirmation before another." : "Awaiting an explicitly designated account verifier. Contact the owner; do not admit from this claim."}</p>}
        </li>;
      })}</ol>
    </section>
    {data.owner && <section className="mt-9 rounded-xl border border-border bg-card p-6" aria-labelledby="digital-authority-title">
      <h2 id="digital-authority-title" className="text-xl font-semibold">Receiving accounts and verifiers</h2>
      <p id="digital-owner-help" className="my-4 text-sm text-muted-foreground">Synthetic designations only. Verify your password before changes. Name a verifier for each account, including yourself if appropriate. Enter a label only; never account credentials.</p>
      <ReauthenticationForm id="digital-owner-password" helpId="digital-owner-help" />
      <form onSubmit={submit} className="mt-5"><input type="hidden" name="action" value="account" />
        <fieldset disabled={busy || !ready} className="grid min-w-0 gap-4 sm:grid-cols-2"><legend className="sr-only">Designate receiving account</legend>
          <label>Account label<Input name="label" maxLength={80} required {...field("label")} /></label>
          <label>Payment method<select name="method" className={selectStyle}><option value="GCASH">GCash</option><option value="BANK">Bank transfer</option></select></label>
          <Button type="submit">Designate receiving account</Button>
        </fieldset></form>
      {!!data.accounts.length && <form onSubmit={submit} className="mt-6"><input type="hidden" name="action" value="verifier" />
        <fieldset disabled={busy || !ready} className="grid min-w-0 gap-4 sm:grid-cols-2"><legend className="mb-3 font-semibold">Assign or revoke account verification</legend>
          <label>Receiving account<select name="accountId" className={selectStyle}>{data.accounts.map(account => <option key={account.id} value={account.id}>{account.method} · {account.label}</option>)}</select></label>
          <label>Named operator<select name="operatorId" className={selectStyle}>{data.operators.map(operator => <option key={operator.id} value={operator.id}>{operator.name}</option>)}</select></label>
          <label>Verification authority<select name="active" className={selectStyle}><option value="true">Grant</option><option value="false">Revoke</option></select></label><Button type="submit">Save verifier authority</Button>
        </fieldset></form>}
      <ul className="mt-4 space-y-2 text-sm">{data.grants.map(grant => <li key={`${grant.accountId}:${grant.operatorId}`}>{data.accounts.find(account => account.id === grant.accountId)?.label} · {data.operators.find(operator => operator.id === grant.operatorId)?.name ?? "Former operator"} · {grant.active ? "Authorized" : "Revoked"}</li>)}</ul>
    </section>}
  </>;
}
