"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatPhp, pesoInput } from "@/lib/money";
import { cashConfirmationSchema, chargePrepareSchema, financeFieldErrors, pendingCashSchema, type PendingCash } from "@/lib/finance-schema";
import type { PlanSummary } from "./plan-settings";

type SavedPreview = {
  id: string; planName: string; durationDays: number; priceCentavos: number; preparerName: string;
  intendedStart: string; intendedEnd: string; preparedAt: string; priceChanged: boolean;
};
const pht = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function ChargePreview({ memberId, memberName, plans, canPrepare, saved, recoveryScope }: { memberId: string; memberName: string; plans: PlanSummary[]; canPrepare: boolean; saved: SavedPreview | null; recoveryScope: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewRequired, setReviewRequired] = useState(false);
  const [cashReceived, setCashReceived] = useState(saved ? pesoInput(saved.priceCentavos) : "");
  const [pending, setPending] = useState<PendingCash | null>(null);
  const [ready, setReady] = useState(false);
  const [confirmed, setConfirmed] = useState<{ payment: { reference: string }; period: { startsAt: string; endsAt: string }; receipt: { reference: string } } | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const pendingRef = useRef<PendingCash | null>(null);
  const storageKey = `cash-recovery:${recoveryScope}`;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        let raw = sessionStorage.getItem(storageKey);
        // Preserve a pending attempt from the previous per-preview storage format.
        if (!raw && saved) {
          const legacy = sessionStorage.getItem(`cash-confirm:${saved.id}`);
          if (legacy) {
            const value = JSON.parse(legacy);
            raw = JSON.stringify(pendingCashSchema.parse({ ...value, chargeId: saved.id, memberId }));
            sessionStorage.setItem(storageKey, raw);
            sessionStorage.removeItem(`cash-confirm:${saved.id}`);
          }
        }
        if (raw) {
          const value = pendingCashSchema.parse(JSON.parse(raw));
          pendingRef.current = value; setPending(value);
        }
        setReady(true);
      } catch {
        setError("Payment recovery storage is unavailable or invalid. Restore this tab's saved operation before collecting cash.");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey, saved, memberId]);
  function clearPending() {
    // If removal fails, retain the recovery gate; retrying the same key is safe.
    sessionStorage.removeItem(storageKey);
    pendingRef.current = null; setPending(null);
  }
  return <section className="mt-7 rounded-xl border border-border bg-card p-6" aria-labelledby="charge-title">
    <h2 id="charge-title" className="text-xl font-semibold">New membership charge preview</h2>
    <p className="mb-5 mt-2 text-sm text-muted-foreground">Review the full charge and proposed dates before collecting funds. A preview is an uncompleted purchase request; it records no payment and grants no admission.</p>
    {canPrepare && plans.length > 0 ? <form className="flex flex-wrap items-end gap-3" aria-busy={busy} onSubmit={async event => {
      event.preventDefault(); if (!ready || busy || pendingRef.current) return;
      setBusy(true); setError("");
      try {
        const parsed = chargePrepareSchema.safeParse({ memberId, planId: new FormData(event.currentTarget).get("planId") });
        if (!parsed.success) throw new Error("Choose a valid member and approved plan.");
        const response = await fetch("/api/charges", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        router.replace(`/members/${memberId}?charge=${result.id}`, { scroll: false }); router.refresh();
      } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to connect. Try again."); errorRef.current?.focus(); }
      finally { setBusy(false); }
    }}>
      <label htmlFor="charge-plan" className="min-w-0 grow basis-64">Approved plan<select id="charge-plan" name="planId" className="min-h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" required disabled={busy || !ready || !!pending}>
        {plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {plan.durationDays} days · {formatPhp(plan.priceCentavos)}</option>)}
      </select></label><Button type="submit" disabled={busy || !ready || !!pending}>{busy ? "Preparing…" : "Prepare charge preview"}</Button>
    </form> : <p className="text-sm text-muted-foreground">{!plans.length ? "Your owner must set up the approved catalogue before a charge can be prepared." : "Preparing a charge requires member access and cash collection permission from your owner."}</p>}
    <p id="cash-error" ref={errorRef} tabIndex={-1} role="alert" className="mt-3 text-sm text-destructive">{error}</p>
    {pending && <div role="status" className="mt-4 text-sm">
      <p>Confirmation status unknown. Resolve the original operation before preparing another charge. Do not collect cash again.</p>
      <Link className="mt-2 inline-block underline" href={`/members/${pending.memberId}?charge=${pending.chargeId}`}>Review unresolved charge</Link>
    </div>}
    {saved && <div aria-live="polite" className="mt-6 border-t border-border pt-6">
      <p className="text-sm font-semibold text-primary">Saved charge preview</p><p className="mt-2 text-3xl font-semibold tabular-nums">{formatPhp(saved.priceCentavos)}</p>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Member</dt><dd className="font-semibold">{memberName}</dd></div>
        <div><dt className="text-muted-foreground">Plan and duration</dt><dd>{saved.planName} · {saved.durationDays} elapsed days</dd></div>
        <div><dt className="text-muted-foreground">Payment options</dt><dd>Full cash or receiving-account verified digital funds</dd></div><div><dt className="text-muted-foreground">Prepared by</dt><dd>{saved.preparerName}</dd></div>
        <div><dt className="text-muted-foreground">Proposed start (inclusive)</dt><dd>{pht.format(new Date(saved.intendedStart))} PHT</dd></div>
        <div><dt className="text-muted-foreground">Proposed end (exclusive)</dt><dd>{pht.format(new Date(saved.intendedEnd))} PHT</dd></div>
        <div><dt className="text-muted-foreground">Prepared at</dt><dd>{pht.format(new Date(saved.preparedAt))} PHT</dd></div>
        <div><dt className="text-muted-foreground">Saved preview reference</dt><dd className="break-all">{saved.id}</dd></div>
      </dl>
      {saved.priceChanged && <p role="status" className="mt-5 text-sm font-semibold">The catalogue price has changed. This saved preview preserves its original terms. {pending ? "Resolve the original operation before preparing a new preview." : "Prepare a new preview to review the current price."}</p>}
      <p className="mt-5 text-sm text-muted-foreground">These proposed dates use the current paid terms for this member. Confirmation rechecks them; if they change, prepare and review a new charge before collecting cash. A paid period does not prove admission before payment verification or its effective start.</p>
    </div>}
      {confirmed ? <div role="status" className="mt-6 rounded-lg border border-primary/40 bg-muted p-4" aria-live="polite">
        <h3 className="font-semibold">Full cash payment confirmed</h3>
        <p className="mt-2">Payment reference: <strong className="break-all">{confirmed.payment.reference}</strong></p>
        <p>Receipt reference: <strong className="break-all">{confirmed.receipt.reference}</strong></p>
        <p className="mt-2">Paid period: {pht.format(new Date(confirmed.period.startsAt))} PHT inclusive to {pht.format(new Date(confirmed.period.endsAt))} PHT exclusive.</p>
        <p className="mt-2 text-sm text-muted-foreground">The period is paid and recorded. Normal admission still depends on its effective start time.</p>
      </div> : canPrepare && (pending || (saved && !saved.priceChanged && !reviewRequired)) ? <form className="mt-6 border-t border-border pt-6" aria-busy={busy} onSubmit={async event => {
        event.preventDefault(); if (!ready || busy || (!pendingRef.current && reviewRequired)) return;
        setBusy(true); setError("");
        try {
          if (!pendingRef.current) {
            const parsed = cashConfirmationSchema.safeParse({ chargeId: saved?.id, cashReceived });
            if (!parsed.success) throw new Error(financeFieldErrors(parsed.error).cashReceived ?? "Choose a saved charge preview.");
          }
          const operation = pendingRef.current ?? { key: crypto.randomUUID(), amount: cashReceived, chargeId: saved!.id, memberId };
          // Persist before sending. Without durable recovery, do not attempt payment.
          sessionStorage.setItem(storageKey, JSON.stringify(operation));
          pendingRef.current = operation; setPending(operation);
          const response = await fetch("/api/payments", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": operation.key }, body: JSON.stringify({ chargeId: operation.chargeId, cashReceived: operation.amount }) });
          const result = await response.json();
          if (!response.ok) {
            if (response.headers.get("cash-confirmation-outcome") === "not-confirmed") {
              clearPending();
              if (response.status === 409) setReviewRequired(true);
            }
            throw new Error(result.error ?? "Cash confirmation failed.");
          }
          clearPending(); setConfirmed(result); router.refresh();
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "Connection or recovery storage unavailable. Retry the same confirmation.");
          errorRef.current?.focus();
        } finally { setBusy(false); }
      }}>
        <h3 className="text-lg font-semibold">{pending ? "Resolve original cash confirmation" : "Confirm full cash received"}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{pending ? "Retry the saved charge, amount and operation key to retrieve the original result. This is the same collection." : "Count the cash first. Only the exact full approved amount confirms payment. Partial cash creates no payment or paid period."}</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label htmlFor="cash-received" className="min-w-0 grow basis-64">Cash received (PHP)
            <input id="cash-received" name="cashReceived" inputMode="decimal" autoComplete="off" required value={pending ? pending.amount : cashReceived} disabled={busy || !!pending || !ready}
              onChange={event => { setCashReceived(event.target.value); setError(""); }} aria-invalid={!!error && !pending} aria-describedby={error ? "cash-required cash-error" : "cash-required"} className="mt-1 min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
          </label>
          <Button type="submit" disabled={busy || !ready}>{busy ? "Confirming…" : pending ? "Retry same confirmation" : "Confirm full cash"}</Button>
        </div>
        <p id="cash-required" className="mt-2 text-sm text-muted-foreground">{pending ? `Original attempted amount: PHP ${pending.amount}.` : `Required exact amount: ${formatPhp(saved!.priceCentavos)}.`}</p>
      </form> : null}
  </section>;
}
