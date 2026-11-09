"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Banknote, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatPhp, parsePesos, pesoInput } from "@/lib/money";
import { cashConfirmationSchema, chargePrepareSchema, onlineConfirmationSchema, pendingCashSchema, pendingPaymentSchema, type PendingPayment } from "@/lib/finance-schema";
import type { PlanSummary } from "./plan-settings";

type SavedPreview = {
  id: string; planId: string; planName: string; durationDays: number; priceCentavos: number; preparerName: string;
  intendedStart: string; intendedEnd: string; preparedAt: string; priceChanged: boolean;
};
type Confirmed = { payment: { reference: string }; period: { startsAt: string; endsAt: string }; receipt: { id: string; reference: string } };
const pht = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function ChargePreview({ memberId, memberName, plans, canPrepare, saved, recoveryScope, saleBlocked, accessStatus, accessReason }: {
  memberId: string; memberName: string; plans: PlanSummary[]; canPrepare: boolean; saved: SavedPreview | null;
  recoveryScope: string; saleBlocked: boolean; accessStatus: string; accessReason: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState(saved ? 1 : 0);
  const [planId, setPlanId] = useState(saved?.planId ?? plans[0]?.id ?? "");
  const [method, setMethod] = useState<"Cash" | "Online">("Cash");
  const [provider, setProvider] = useState("GCash");
  const [reference, setReference] = useState("");
  const [fundsChecked, setFundsChecked] = useState(false);
  const [amount, setAmount] = useState(saved ? pesoInput(saved.priceCentavos) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewRequired, setReviewRequired] = useState(false);
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const [ready, setReady] = useState(false);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const pendingRef = useRef<PendingPayment | null>(null);
  // Keep the original scope: an unknown cash attempt also blocks switching to Online.
  const storageKey = `cash-recovery:${recoveryScope}`;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        let raw = sessionStorage.getItem(storageKey);
        if (!raw && saved) {
          const legacy = sessionStorage.getItem(`cash-confirm:${saved.id}`);
          if (legacy) {
            raw = JSON.stringify(pendingCashSchema.parse({ ...JSON.parse(legacy), chargeId: saved.id, memberId }));
            sessionStorage.setItem(storageKey, raw); sessionStorage.removeItem(`cash-confirm:${saved.id}`);
          }
        }
        if (raw) { const value = pendingPaymentSchema.parse(JSON.parse(raw)); pendingRef.current = value; setPending(value); setStage(2); }
        setReady(true);
      } catch { setError("Payment recovery storage is unavailable or invalid. Restore this tab's saved operation before collecting funds."); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey, saved, memberId]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    if (!ready) return;
    titleRef.current?.focus({ preventScroll: true });
    if (stage > 0) {
      const title = titleRef.current;
      const dialog = title?.closest<HTMLElement>('[role="dialog"]');
      if (dialog) { dialog.scrollTop = 0; return; }
      const main = document.getElementById("main");
      if (main && title && getComputedStyle(main).overflowY === "auto") {
        window.scrollTo(0, 0);
        main.scrollTop += title.getBoundingClientRect().top - main.getBoundingClientRect().top - 24;
      } else title?.scrollIntoView({ block: "start" });
    }
  }, [stage, ready]);
  const plan = plans.find(item => item.id === planId);
  const terms = stage === 0 ? plan : saved;
  const price = terms?.priceCentavos;
  const locked = busy || !ready || !!pending || saleBlocked || !canPrepare;
  const paymentMethod = pending ? "provider" in pending ? `Online · ${pending.provider}` : "Cash" : method === "Online" ? `Online · ${provider}` : "Cash";
  function paymentInput() {
    if (!saved) throw new Error("Prepare a membership charge first.");
    if (parsePesos(amount) !== saved.priceCentavos) throw new Error(`Enter the exact full amount: ${formatPhp(saved.priceCentavos)}. No payment was recorded.`);
    if (method === "Online") {
      const parsed = onlineConfirmationSchema.safeParse({ chargeId: saved.id, amount, provider, transactionReference: reference, fundsChecked });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      return parsed.data;
    }
    const parsed = cashConfirmationSchema.safeParse({ chargeId: saved.id, cashReceived: amount });
    if (!parsed.success) throw new Error("Enter the full cash amount in PHP.");
    return parsed.data;
  }
  async function prepare() {
    if (locked) return;
    setBusy(true); setError("");
    try {
      const parsed = chargePrepareSchema.safeParse({ memberId, planId });
      if (!parsed.success) throw new Error("Choose an approved membership plan.");
      const response = await fetch("/api/charges", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      router.replace(`/members/${memberId}?charge=${result.id}#membership-payment`); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to connect. Try again."); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!ready || busy || (!pendingRef.current && (reviewRequired || saleBlocked || saved?.priceChanged))) return;
    setBusy(true); setError("");
    try {
      let operation = pendingRef.current;
      if (!operation) {
        const input = paymentInput();
        operation = "provider" in input ? { ...input, key: crypto.randomUUID(), memberId } : { key: crypto.randomUUID(), amount: input.cashReceived, chargeId: input.chargeId, memberId };
      }
      // Persist before sending. On uncertainty only the original operation may run.
      sessionStorage.setItem(storageKey, JSON.stringify(operation)); pendingRef.current = operation; setPending(operation);
      const online = "provider" in operation;
      const body = "provider" in operation ? { chargeId: operation.chargeId, amount: operation.amount, provider: operation.provider, transactionReference: operation.transactionReference, fundsChecked: operation.fundsChecked } : { chargeId: operation.chargeId, cashReceived: operation.amount };
      const response = await fetch(online ? "/api/payments/online" : "/api/payments", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": operation.key }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) {
        if (response.headers.get(online ? "payment-confirmation-outcome" : "cash-confirmation-outcome") === "not-confirmed") {
          sessionStorage.removeItem(storageKey); pendingRef.current = null; setPending(null);
          if (response.status === 409) setReviewRequired(true);
        }
        throw new Error(result.error ?? "Payment confirmation failed.");
      }
      sessionStorage.removeItem(storageKey); pendingRef.current = null; setPending(null);
      setMethod(online ? "Online" : "Cash");
      if ("provider" in operation) setProvider(operation.provider);
      if (operation.memberId !== memberId || operation.chargeId !== saved?.id) router.replace(`/members/${operation.memberId}?charge=${operation.chargeId}#member-payments`);
      else setConfirmed(result);
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Connection or recovery storage unavailable. Retry the same confirmation."); }
    finally { setBusy(false); }
  }
  const changePlan = <Button variant="outline" disabled={locked} onClick={() => { setStage(0); setError(""); }}><ArrowLeft className="size-4" aria-hidden="true" />Change plan</Button>;
  return <section aria-labelledby="charge-title" aria-busy={busy} id="membership-payment" className="grid min-w-0 items-start gap-6 px-5 pb-6 sm:px-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(240px,1fr)]">
    <div className="min-w-0">
      <div className="space-y-2 border-b border-border pb-5">
        <h2 id="charge-title" ref={titleRef} tabIndex={-1} className="scroll-mt-6 text-xl font-semibold tracking-tight outline-offset-4">{confirmed ? "Membership recorded" : pending ? "Resolve payment confirmation" : ["Choose a membership", "Choose payment method", "Review membership charge"][stage]}</h2>
        <p className="text-sm text-muted-foreground">{confirmed ? "Your payment and paid period are saved." : "Choose the plan, check the full amount, then record the received payment."}</p>
        <ol aria-label="Payment steps" className="mt-4 flex items-center gap-1 text-xs sm:gap-4 sm:text-sm">
          {["Plan", "Payment", "Review"].map((label, index) => <li key={label} aria-current={!confirmed && stage === index ? "step" : undefined} className="flex min-w-0 flex-1 items-center gap-1 last:flex-none sm:gap-2">
            <span className={`grid size-6 shrink-0 place-items-center rounded-full border sm:size-7 ${stage >= index ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>{stage > index || confirmed ? <Check aria-hidden="true" className="size-3.5" /> : index + 1}</span>
            <span className={stage === index ? "font-semibold" : "text-muted-foreground"}>{label}</span>{index < 2 && <span className="h-px flex-1 bg-border" aria-hidden="true" />}
          </li>)}
        </ol>
      </div>
      <div className="pt-6">
        <p id="cash-error" ref={errorRef} tabIndex={-1} role="alert" className={error ? "mb-5 rounded-md bg-destructive/10 p-3 text-sm text-destructive outline-offset-4" : ""}>{error}</p>
        {saleBlocked && !confirmed && <p role="status" className="mb-5 rounded-md bg-attention-surface p-4 text-sm text-attention">An advance renewal is already fully paid. Another sale is blocked until the scheduled paid period starts. Resolve any original confirmation below without collecting again.</p>}
        {confirmed ? <div role="status" className="space-y-4" aria-live="polite">
          <div className="flex items-center gap-2 text-success"><Check className="size-5" aria-hidden="true" /><h3 className="font-semibold">{method === "Cash" ? "Full cash payment confirmed" : "Full online payment confirmed"}</h3></div>
          <p className="text-sm">{memberName} · {paymentMethod}</p>
          <p className="break-all text-sm">Payment reference: <strong>{confirmed.payment.reference}</strong></p>
          <p className="break-all text-sm">Receipt reference: <strong>{confirmed.receipt.reference}</strong></p>
          <p className="text-sm">Paid period: {pht.format(new Date(confirmed.period.startsAt))} PHT inclusive to {pht.format(new Date(confirmed.period.endsAt))} PHT exclusive.</p>
          <p className="text-sm text-muted-foreground">Normal admission depends on the paid period&apos;s effective start.</p>
          <Link className="action-link" href={`/receipts/${confirmed.receipt.id}`}>View receipt</Link>
        </div> : pending ? <div className="space-y-5">
          <p role="status" className="rounded-md bg-attention-surface p-4 text-sm text-attention">Confirmation status unknown. Resolve the original operation before preparing another charge. Do not collect funds again.</p>
          <dl className="grid gap-3 text-sm"><div><dt className="text-muted-foreground">Original payment</dt><dd>{paymentMethod} · PHP {pending.amount}</dd></div>{"provider" in pending && <div><dt className="text-muted-foreground">Transaction reference</dt><dd className="break-all">{pending.transactionReference}</dd></div>}</dl>
          <Link className="block text-sm underline" href={`/members/${pending.memberId}?charge=${pending.chargeId}#membership-payment`}>Review unresolved charge</Link>
          {canPrepare && <Button disabled={busy || !ready} onClick={confirm}>{busy ? "Confirming…" : "Retry same confirmation"}</Button>}
        </div> : stage === 0 ? <form onSubmit={event => { event.preventDefault(); void prepare(); }} aria-busy={busy}>
          <fieldset disabled={locked}><legend className="font-semibold">Select a membership plan</legend><p className="mb-4 mt-1 text-sm text-muted-foreground">One fixed term. Choose from your gym&apos;s approved plans.</p>
            <div className="space-y-3">{plans.map(item => <label key={item.id} className={`grid min-w-0 cursor-pointer grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 rounded-md border p-4 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring ${planId === item.id ? "border-primary bg-muted" : "border-border hover:bg-muted/50"}`}>
              <input type="radio" name="planId" value={item.id} checked={planId === item.id} onChange={() => setPlanId(item.id)} className="mt-1 size-4 accent-primary" />
              <span className="font-semibold">{item.name}</span><span className="font-semibold tabular-nums">{formatPhp(item.priceCentavos)}</span><span className="col-span-2 col-start-2 text-xs text-muted-foreground">{item.durationDays} days of access · One-time payment</span>
            </label>)}</div>
          </fieldset>
          {!plans.length && <p role="status" className="mt-3 text-sm text-muted-foreground">Your owner must set up the approved catalogue before a charge can be prepared.</p>}
          {!canPrepare && <p role="status" className="mt-3 text-sm text-muted-foreground">Preparing a charge requires member access and collection permission from your owner.</p>}
          <p className="my-5 rounded-md bg-muted p-4 text-sm text-muted-foreground">New or expired memberships start at 00:00 PHT on the verification date. Early renewals start at the current term&apos;s end. Preparing a charge grants no paid access.</p>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5"><span className="text-xs text-muted-foreground">No payment is recorded in this step.</span><Button type="submit" disabled={locked || !plan}>{busy ? "Preparing…" : "Continue to payment"}<ArrowRight className="size-4" aria-hidden="true" /></Button></div>
        </form> : saved && (saved.priceChanged || reviewRequired) ? <div className="space-y-5"><p role="status" className="text-sm text-attention">{saved.priceChanged ? "The catalogue price has changed. This saved preview preserves its original terms." : "The plan, dates or payment details require a fresh review."} Prepare a new charge before collecting funds.</p>{changePlan}</div> : saved ? <form aria-busy={busy} onSubmit={event => {
          event.preventDefault(); if (locked) return;
          if (stage === 2) { void confirm(); return; }
          try { paymentInput(); setError(""); setStage(2); } catch (failure) { setError(failure instanceof Error ? failure.message : "Check the payment details."); }
        }}>
          {stage === 1 ? <>
            <fieldset disabled={locked}><legend className="font-semibold">Payment method</legend><div className="mt-3 grid grid-cols-2 gap-3">{(["Cash", "Online"] as const).map(value => <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring ${method === value ? "border-primary bg-muted" : "border-border"}`}><input type="radio" name="paymentMethod" value={value} checked={method === value} onChange={() => { setMethod(value); setFundsChecked(false); setError(""); }} className="size-4 accent-primary" />{value === "Cash" ? <Banknote aria-hidden="true" className="size-4" /> : <Smartphone aria-hidden="true" className="size-4" />}<span className="font-medium">{value}</span></label>)}</div></fieldset>
            {method === "Online" && <div className="mt-5 space-y-4"><div><Label htmlFor="online-provider">Online provider</Label><select id="online-provider" value={provider} disabled={locked} onChange={event => { setProvider(event.target.value); setFundsChecked(false); }} className="mt-2 min-h-11 w-full rounded-md border border-input bg-card px-3 text-base">{["GCash", "GoTyme", "MariBank"].map(value => <option key={value}>{value}</option>)}</select></div><div><Label htmlFor="online-reference">Transaction reference</Label><Input id="online-reference" value={reference} maxLength={100} required disabled={locked} autoComplete="off" onChange={event => { setReference(event.target.value); setFundsChecked(false); }} className="mt-2" /></div></div>}
            <div className="mt-5"><Label htmlFor="cash-received">{method === "Cash" ? "Cash received (PHP)" : "Verified amount received (PHP)"}</Label><Input id="cash-received" name="cashReceived" inputMode="decimal" autoComplete="off" required value={amount} disabled={locked} onChange={event => { setAmount(event.target.value); setFundsChecked(false); setError(""); }} aria-invalid={!!error && parsePesos(amount) !== saved.priceCentavos} aria-describedby={error ? "cash-required cash-error" : "cash-required"} className="mt-2 tabular-nums" /><p id="cash-required" className="mt-2 text-xs text-muted-foreground">Required exact amount: {formatPhp(saved.priceCentavos)}.</p></div>
            {method === "Online" && <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-md border border-border p-4 text-sm"><input type="checkbox" checked={fundsChecked} disabled={locked} aria-describedby={error ? "cash-error" : undefined} onChange={event => { setFundsChecked(event.target.checked); setError(""); }} className="mt-1 size-4 shrink-0 accent-primary" /><span>I checked the gym&apos;s {provider} receiving account and verified the full amount and transaction reference. A sender&apos;s screenshot alone is not proof.</span></label>}
            <p className="mt-5 text-sm text-muted-foreground">{method === "Cash" ? "Count the cash first. Partial cash creates no payment or paid period." : "Confirm only funds you can see received in the gym's account. Unverified transfers grant no paid access."}</p>
          </> : <>
            <h3 className="font-semibold">Check before recording payment</h3>
            <dl className="mt-4 divide-y divide-border text-sm">{[["Member", memberName], ["Plan", `${saved.planName} · ${saved.durationDays} days`], ["Payment method", paymentMethod], ...(method === "Online" ? [["Transaction reference", reference]] : []), ["Amount received", formatPhp(parsePesos(amount) ?? 0)], ["Starts (inclusive)", `${pht.format(new Date(saved.intendedStart))} PHT`], ["Ends (exclusive)", `${pht.format(new Date(saved.intendedEnd))} PHT`]].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-x-5 gap-y-1 py-3"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words font-medium">{value}</dd></div>)}</dl>
            <p role="status" className="mt-5 rounded-md bg-attention-surface p-4 text-sm text-attention">{method === "Cash" ? "Confirm only after receiving the full cash amount." : "Confirm only after checking the full funds in the gym's receiving account."} This records a confirmed payment, receipt and paid period.</p>
          </>}
          <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-border pt-5">{stage === 1 ? changePlan : <Button variant="outline" disabled={locked} onClick={() => { setStage(1); setError(""); }}><ArrowLeft aria-hidden="true" className="size-4" />Back to payment</Button>}<Button type="submit" disabled={locked}>{busy ? "Confirming…" : stage === 1 ? method === "Cash" ? "Review cash payment" : "Review online payment" : method === "Cash" ? "Confirm full cash" : "Confirm received online payment"}{stage === 1 && <ArrowRight className="size-4" aria-hidden="true" />}</Button></div>
        </form> : null}
      </div>
    </div>
    <aside className="min-w-0 border-t border-border pt-5 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0" aria-label="Charge and access summary">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Charge preview</h3><Badge variant="outline">{confirmed ? "Confirmed" : stage === 0 ? "Estimate" : "Saved charge preview"}</Badge></div><div className="mt-4 space-y-4">
        <div><p className="font-semibold">{terms ? "name" in terms ? terms.name : terms.planName : "Choose a plan"}</p><p className="mt-1 text-xs text-muted-foreground">{terms ? `${terms.durationDays} days · One-time payment` : "No approved plan selected"}</p></div>
        <dl className="space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Membership fee</dt><dd className="font-medium tabular-nums">{price === undefined ? "—" : formatPhp(price)}</dd></div>{stage > 0 && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Payment</dt><dd>{paymentMethod}</dd></div>}</dl><Separator />
        <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-sm font-semibold">{confirmed ? "Paid in full" : "Due in full"}</span><strong className="text-2xl tracking-tight tabular-nums">{price === undefined ? "—" : formatPhp(price)}</strong></div>
        {saved && stage > 0 ? <dl className="space-y-3 text-xs"><div><dt className="text-muted-foreground">{confirmed ? "Paid period start" : "Proposed start"} · inclusive</dt><dd className="mt-1">{pht.format(new Date(confirmed?.period.startsAt ?? saved.intendedStart))} PHT</dd></div><div><dt className="text-muted-foreground">{confirmed ? "Paid period end" : "Proposed end"} · exclusive</dt><dd className="mt-1">{pht.format(new Date(confirmed?.period.endsAt ?? saved.intendedEnd))} PHT</dd></div></dl> : <p className="text-xs text-muted-foreground">Dates are calculated when you continue. No automatic recurring charge.</p>}
        <p className="text-xs leading-relaxed text-muted-foreground">{confirmed ? "Receipt and payment history are saved." : "Review before recording payment. No installment, discount or unpaid balance."}</p>
        {saved && <details className="text-xs"><summary className="cursor-pointer py-2 text-muted-foreground">Saved charge details</summary><p className="mt-2 break-all">{saved.id}</p><p className="mt-2">Prepared by {saved.preparerName} · {pht.format(new Date(saved.preparedAt))} PHT</p></details>}
      </div>
      <div className="mt-5 border-t border-border pt-5"><h3 className="mb-3 font-semibold">Current access</h3><p className="text-sm font-semibold">{accessStatus}</p><p className="mt-2 text-sm text-muted-foreground">{accessReason}</p><p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">Charge previews and unverified transfers do not grant access.</p></div>
    </aside>
  </section>;
}
