"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { identityRequest } from "@/lib/client";
import { formatPhp, pesoInput } from "@/lib/money";

export type PlanSummary = { id: string; name: string; durationDays: number; priceCentavos: number; version: number };
export function PlanSettings({ initial }: { initial: PlanSummary[] }) {
  const [plans, setPlans] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [invalidPrice, setInvalidPrice] = useState<string | null>(null);
  const feedback = useRef<HTMLDivElement>(null);
  async function save(body: object, planId?: string) {
    setBusy(true); setMessage(""); setError(false); setInvalidPrice(null);
    try {
      const response = await fetch("/api/plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) { if (response.status === 400 && planId) setInvalidPrice(planId); throw new Error(result.error); }
      setPlans(result); setMessage("Catalogue saved. Existing charge previews keep their original terms.");
    } catch (failure) { setError(true); setMessage(failure instanceof Error ? failure.message : "Unable to connect. Try again."); feedback.current?.focus(); }
    finally { setBusy(false); }
  }
  return <div className="mt-8 space-y-7">
    <section className="rounded-xl border border-border bg-card p-6" aria-labelledby="pricing-verify-title">
      <h2 id="pricing-verify-title" className="text-xl font-semibold">Verify before changing prices</h2>
      <p id="pricing-verify-help" className="mb-5 mt-2 text-sm text-muted-foreground">Verify your owner password. Price changes require verification within five minutes.</p>
      <form className="flex flex-wrap items-end gap-3" onSubmit={async event => {
        event.preventDefault(); const form = event.currentTarget; setBusy(true); setMessage(""); setError(false);
        try { await identityRequest("reauthenticate", { password: new FormData(form).get("password") }); setMessage("Password verified for five minutes."); }
        catch (failure) { setError(true); setMessage(failure instanceof Error ? failure.message : "Unable to connect. Try again."); feedback.current?.focus(); }
        finally { form.reset(); setBusy(false); }
      }}>
        <label htmlFor="pricing-password" className="grow">Owner password<Input id="pricing-password" name="password" type="password" autoComplete="current-password" maxLength={128} aria-describedby="pricing-verify-help" required disabled={busy} /></label>
        <Button type="submit" disabled={busy}>Verify password</Button>
      </form>
    </section>
    <div ref={feedback} tabIndex={-1} role={error ? "alert" : "status"} className={`rounded-md text-sm outline-offset-4 ${error ? "text-destructive" : "text-muted-foreground"}`}>
      {message}{invalidPrice && <a href={`#price-${invalidPrice}`} className="ml-2 underline">Review this price</a>}
    </div>
    {!plans.length ? <section className="rounded-xl border border-border bg-card p-6" aria-labelledby="approved-title">
      <h2 id="approved-title" className="mb-3 text-xl font-semibold">Set up the approved catalogue</h2>
      <ul className="mb-5 list-inside list-disc space-y-2"><li>Monthly: ₱800.00 · 30 days</li><li>3 Months: ₱2,100.00 · 90 days</li><li>6 Months: ₱4,000.00 · 180 days</li></ul>
      <Button disabled={busy} onClick={() => save({ action: "initialize" })}>{busy ? "Saving…" : "Apply approved catalogue"}</Button>
    </section> : <section aria-labelledby="catalogue-title"><h2 id="catalogue-title" className="mb-4 text-xl font-semibold">Current catalogue</h2>
      <div className="grid gap-4 md:grid-cols-3">{plans.map(plan => <form key={`${plan.id}-${plan.version}`} aria-label={`${plan.name} pricing`} className="space-y-4 rounded-xl border border-border bg-card p-5" onSubmit={event => {
        event.preventDefault(); save({ action: "update", planId: plan.id, version: plan.version, price: new FormData(event.currentTarget).get("price") }, plan.id);
      }}>
        <div><h3 className="text-lg font-semibold">{plan.name}</h3><p className="text-sm text-muted-foreground">{plan.durationDays} elapsed days · Current {formatPhp(plan.priceCentavos)}</p></div>
        <label htmlFor={`price-${plan.id}`}>Full price (PHP)<Input id={`price-${plan.id}`} name="price" type="text" inputMode="decimal" defaultValue={pesoInput(plan.priceCentavos)} pattern="[0-9]{1,8}([.][0-9]{1,2})?" maxLength={11} required disabled={busy} aria-describedby="price-help" aria-invalid={invalidPrice === plan.id} /></label>
        <Button type="submit" disabled={busy} className="w-full">{busy ? "Saving…" : `Save ${plan.name} price`}</Button>
      </form>)}</div>
    </section>}
    <p id="price-help" className="text-sm text-muted-foreground">Enter pesos with up to two decimal places, without commas. Each day lasts 24 hours. Saving a new price affects later previews; saved previews remain unchanged.</p>
    <Link href="/members" className="inline-flex min-h-11 items-center underline">Go to members</Link>
  </div>;
}
