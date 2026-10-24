"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatPhp } from "@/lib/money";
import type { PlanSummary } from "./plan-settings";

type SavedPreview = {
  id: string; planName: string; durationDays: number; priceCentavos: number; preparerName: string;
  intendedStart: string; intendedEnd: string; preparedAt: string; priceChanged: boolean;
};
const pht = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function ChargePreview({ memberId, memberName, plans, canPrepare, saved }: { memberId: string; memberName: string; plans: PlanSummary[]; canPrepare: boolean; saved: SavedPreview | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
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
      <p className="text-sm font-semibold text-primary">Saved preview · Payment not recorded</p><p className="mt-2 text-3xl font-semibold tabular-nums">{formatPhp(saved.priceCentavos)}</p>
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
      <p className="mt-5 text-sm text-muted-foreground">Dates are proposed from midnight Asia/Manila on the preparation date. They do not prove admission before payment verification.</p>
    </div>}
  </section>;
}
