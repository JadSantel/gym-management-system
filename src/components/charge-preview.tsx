"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatPhp, pesoInput } from "@/lib/money";
import type { PlanSummary } from "./plan-settings";

type SavedPreview = {
  id: string; planName: string; durationDays: number; priceCentavos: number; preparerName: string;
  intendedStart: string; intendedEnd: string; preparedAt: string; priceChanged: boolean;
};
const pht = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
type PendingCash = { key: string; amount: string };
export function ChargePreview({ memberId, memberName, plans, canPrepare, saved }: { memberId: string; memberName: string; plans: PlanSummary[]; canPrepare: boolean; saved: SavedPreview | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cashReceived, setCashReceived] = useState(saved ? pesoInput(saved.priceCentavos) : "");
  const [pending, setPending] = useState<PendingCash | null>(null);
  const [ready, setReady] = useState(false);
  const [confirmed, setConfirmed] = useState<{ payment: { reference: string }; period: { startsAt: string; endsAt: string }; receipt: { reference: string } } | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const pendingRef = useRef<PendingCash | null>(null);
  const storageKey = saved ? `cash-confirm:${saved.id}` : "";
  useEffect(() => {
    if (!storageKey) return;
    const timer = window.setTimeout(() => {
      let raw: string | null = null;
      try { raw = sessionStorage.getItem(storageKey); } catch { /* Storage may be disabled; in-page retries still work. */ }
      if (raw) {
        try { const value = JSON.parse(raw) as PendingCash; if (value.key && value.amount) { pendingRef.current = value; setPending(value); setCashReceived(value.amount); } }
        catch { try { sessionStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ } }
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);
  function clearPending() {
    pendingRef.current = null; setPending(null);
    if (storageKey) try { sessionStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ }
  }
  return <section className="mt-7 rounded-xl border border-border bg-card p-6" aria-labelledby="charge-title">
    <h2 id="charge-title" className="text-xl font-semibold">New membership charge preview</h2>
    <p className="mb-5 mt-2 text-sm text-muted-foreground">Review the full charge and proposed dates before collecting funds. A preview records no payment and grants no admission.</p>
    {canPrepare && plans.length > 0 ? <form className="flex flex-wrap items-end gap-3" aria-busy={busy} onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try {
        const response = await fetch("/api/charges", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memberId, planId: new FormData(event.currentTarget).get("planId") }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        router.replace(`/members/${memberId}?charge=${result.id}`, { scroll: false }); router.refresh();
      } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to connect. Try again."); errorRef.current?.focus(); }
      finally { setBusy(false); }
    }}>
      <label htmlFor="charge-plan" className="min-w-0 grow basis-64">Approved plan<select id="charge-plan" name="planId" className="min-h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" required disabled={busy}>
        {plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {plan.durationDays} days · {formatPhp(plan.priceCentavos)}</option>)}
      </select></label><Button type="submit" disabled={busy}>{busy ? "Preparing…" : "Prepare charge preview"}</Button>
    </form> : <p className="text-sm text-muted-foreground">{!plans.length ? "Your owner must set up the approved catalogue before a charge can be prepared." : "Preparing a charge requires member access and cash collection permission from your owner."}</p>}
    <p ref={errorRef} tabIndex={-1} role="alert" className="mt-3 text-sm text-destructive">{error}</p>
    {saved && <div aria-live="polite" className="mt-6 border-t border-border pt-6">
      <p className="text-sm font-semibold text-primary">Saved charge preview</p><p className="mt-2 text-3xl font-semibold tabular-nums">{formatPhp(saved.priceCentavos)}</p>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Member</dt><dd className="font-semibold">{memberName}</dd></div>
        <div><dt className="text-muted-foreground">Plan and duration</dt><dd>{saved.planName} · {saved.durationDays} elapsed days</dd></div>
        <div><dt className="text-muted-foreground">Proposed method</dt><dd>Full cash</dd></div><div><dt className="text-muted-foreground">Prepared by</dt><dd>{saved.preparerName}</dd></div>
        <div><dt className="text-muted-foreground">Proposed start (inclusive)</dt><dd>{pht.format(new Date(saved.intendedStart))} PHT</dd></div>
        <div><dt className="text-muted-foreground">Proposed end (exclusive)</dt><dd>{pht.format(new Date(saved.intendedEnd))} PHT</dd></div>
        <div><dt className="text-muted-foreground">Prepared at</dt><dd>{pht.format(new Date(saved.preparedAt))} PHT</dd></div>
        <div><dt className="text-muted-foreground">Saved preview reference</dt><dd className="break-all">{saved.id}</dd></div>
      </dl>
      {saved.priceChanged && <p role="status" className="mt-5 text-sm font-semibold">The catalogue price has changed. This saved preview preserves its original terms. Prepare a new preview to review the current price.</p>}
      <p className="mt-5 text-sm text-muted-foreground">Preview dates are estimates from the preparation date. Confirmation records the actual paid period and does not prove admission before its effective start.</p>
      {confirmed ? <div role="status" className="mt-6 rounded-lg border border-primary/40 bg-muted p-4" aria-live="polite">
        <h3 className="font-semibold">Full cash payment confirmed</h3>
        <p className="mt-2">Payment reference: <strong className="break-all">{confirmed.payment.reference}</strong></p>
        <p>Receipt reference: <strong className="break-all">{confirmed.receipt.reference}</strong></p>
        <p className="mt-2">Paid period: {pht.format(new Date(confirmed.period.startsAt))} PHT inclusive to {pht.format(new Date(confirmed.period.endsAt))} PHT exclusive.</p>
        <p className="mt-2 text-sm text-muted-foreground">The period is paid and recorded. Normal admission still depends on its effective start time.</p>
      </div> : canPrepare && !saved.priceChanged ? <form className="mt-6 border-t border-border pt-6" aria-busy={busy} onSubmit={async event => {
        event.preventDefault(); if (!ready || busy) return;
        setBusy(true); setError("");
        const operation = pendingRef.current ?? { key: crypto.randomUUID(), amount: cashReceived };
        pendingRef.current = operation; setPending(operation);
        if (storageKey) try { sessionStorage.setItem(storageKey, JSON.stringify(operation)); } catch { /* Storage may be disabled; in-page retries still work. */ }
        try {
          const response = await fetch("/api/payments", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": operation.key }, body: JSON.stringify({ chargeId: saved.id, cashReceived: operation.amount }) });
          const result = await response.json();
          if (!response.ok) {
            if (response.status < 500) clearPending();
            throw new Error(result.error ?? "Cash confirmation failed.");
          }
          clearPending(); setConfirmed(result);
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "Connection lost. Retry the same confirmation.");
          errorRef.current?.focus();
        } finally { setBusy(false); }
      }}>
        <h3 className="text-lg font-semibold">Confirm full cash received</h3>
        <p className="mt-2 text-sm text-muted-foreground">Count the cash first. Only the exact full approved amount confirms payment. Partial cash creates no payment or paid period.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label htmlFor="cash-received" className="min-w-0 grow basis-64">Cash received (PHP)
            <input id="cash-received" name="cashReceived" inputMode="decimal" autoComplete="off" required value={pending ? pending.amount : cashReceived} disabled={busy || !!pending || !ready}
              onChange={event => { setCashReceived(event.target.value); setError(""); }} aria-invalid={!!error && !pending} aria-describedby={error ? "cash-required cash-error" : "cash-required"} className="mt-1 min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
          </label>
          <Button type="submit" disabled={busy || !ready}>{busy ? "Confirming…" : pending ? "Retry same confirmation" : "Confirm full cash"}</Button>
        </div>
        <p id="cash-required" className="mt-2 text-sm text-muted-foreground">Required exact amount: {formatPhp(saved.priceCentavos)}.</p>
        {pending && <p role="status" className="mt-2 text-sm">Confirmation status may be unknown. Retry with the same amount to safely retrieve its result.</p>}
        <p id="cash-error" ref={errorRef} tabIndex={-1} role="alert" className="mt-3 text-sm text-destructive">{error}</p>
      </form> : null}
    </div>}
  </section>;
}
