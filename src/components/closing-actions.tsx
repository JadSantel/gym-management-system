"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ReauthenticationForm } from "./reauthentication-form";
import { closingCommandSchema, closingFieldErrors, closingRecoverySchema, type ClosingCommand } from "@/lib/closing-schema";

type Recovery = { key: string; command: ClosingCommand };
type Props = { day: string; sourceHash: string; owner: boolean; canPrepare: boolean; ended: boolean; recoveryScope: string;
  previousId: string | null; checkIds: string[]; operators: { id: string; name: string }[];
  accounts: { id: string; label: string; method: string; allowed: boolean }[]; investigations: { id: string; reason: string; summary: string }[] };
const selectStyle = "min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ClosingActions(props: Props) {
  const router = useRouter(); const [action, setAction] = useState("count"); const [method, setMethod] = useState(props.canPrepare ? "CASH" : "GCASH");
  const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [pending, setPending] = useState<Recovery | null>(null); const pendingRef = useRef<Recovery | null>(null);
  const [message, setMessage] = useState(""); const [errors, setErrors] = useState<Record<string,string>>({});
  const feedback = useRef<HTMLDivElement>(null); const storageKey = `closing-recovery:${props.recoveryScope}`;
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) { const saved = closingRecoverySchema.parse(JSON.parse(raw)); pendingRef.current = saved; setPending(saved); }
        setReady(true);
      } catch { setMessage("Recovery storage is unavailable. Restore the saved closing operation before a new submission."); }
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey]);
  async function send(command: ClosingCommand, recovery?: Recovery) {
    if (!ready || busyRef.current) return;
    busyRef.current = true; setBusy(true); setErrors({}); setMessage("");
    try {
      if (pendingRef.current && !recovery) throw new Error("Retrieve the saved closing operation first.");
      const saved = recovery ?? { key: crypto.randomUUID(), command };
      sessionStorage.setItem(storageKey, JSON.stringify(saved)); pendingRef.current = saved; setPending(saved);
      const response = await fetch("/api/closing", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": saved.key }, body: JSON.stringify(saved.command) });
      const result = await response.json();
      if (!response.ok) {
        if (response.headers.get("closing-command-outcome") === "not-recorded") { sessionStorage.removeItem(storageKey); pendingRef.current = null; setPending(null); }
        setErrors(result.fieldErrors ?? {}); throw new Error(result.error);
      }
      sessionStorage.removeItem(storageKey); pendingRef.current = null; setPending(null);
      setMessage(saved.command.action === "count" ? "Actual evidence saved. Review every collector and method before submission."
        : saved.command.action === "submit" ? "Immutable closing submitted. Differences and outstanding items remain visible."
        : "Owner acknowledged the unresolved closing. Amounts and open items remain unchanged.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connection unavailable. Retrieve the saved operation."); }
    finally { busyRef.current = false; setBusy(false); feedback.current?.focus(); }
  }
  const attrs = (name: string) => ({ id: `closing-${name}`, name, "aria-invalid": !!errors[name], "aria-describedby": errors[name] ? `closing-error-${name}` : undefined });
  const field = (name: string, label: string, node: React.ReactNode) => <div key={name} className="min-w-0"><label className="mb-1 block text-sm font-medium" htmlFor={`closing-${name}`}>{label}</label>{node}{errors[name] && <p id={`closing-error-${name}`} className="mt-1 text-sm text-destructive">{errors[name]}</p>}</div>;
  const input = (name: string, label: string, options: React.ComponentProps<typeof Input> = {}) => field(name,label,<Input {...attrs(name)} required maxLength={100} {...options} />);
  const attest = (name: string,label: string) => field(name,label,<input {...attrs(name)} type="checkbox" value="true" required className="size-5 accent-primary" />);
  const select = (name: string,label: string,options: [string,string][]) => field(name,label,<select {...attrs(name)} required className={selectStyle}><option value="">Choose…</option>{options.map(([id,text]) => <option value={id} key={id}>{text}</option>)}</select>);
  return <section className="mt-7 rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="closing-actions-title">
    <h2 id="closing-actions-title" className="text-xl font-semibold">Prepare and review closing</h2>
    <p className="mt-2 text-sm">Zero opening membership float. Keep non-membership money separate. Cash gross equals held cash plus evidenced transfers and payouts from this day&apos;s batch. Count each portion once. Digital actuals require a designated receiving-account viewer.</p>
    <div ref={feedback} id="closing-feedback" role="status" tabIndex={-1} className="mt-4 break-words outline-offset-4">
      {message && <p>{message}</p>}{Object.entries(errors).map(([name,text]) => <a key={name} className="block text-sm underline" href={`#closing-${name}`}>{text} ({name})</a>)}
    </div>
    {pending && <div className="mt-4 border-l-4 border-primary pl-4"><p>A saved {pending.command.action} operation may have committed. Retrieve it with its original key before another submission.</p><Button className="mt-2" disabled={busy || !ready} onClick={() => void send(pending.command,pending)}>Retrieve saved closing operation</Button></div>}
    {props.owner && <div className="mt-5"><p id="closing-owner-help" className="mb-2 text-sm">Approval requires owner password verification within five minutes. Approval acknowledges differences; it moves no money.</p><ReauthenticationForm id="closing-owner-password" helpId="closing-owner-help" disabled={busy} /></div>}
    <form className="mt-5" noValidate onSubmit={event => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
      const common = { evidenceReference: values.evidenceReference, notes: values.notes, sourceHash: props.sourceHash };
      const command = action === "count" ? { ...common, action, day: props.day, collectorId: values.collectorId, method,
        accountId: method === "CASH" ? null : values.accountId, caseId: values.caseId || null, amount: values.amount, cashHeld: method === "CASH" ? values.cashHeld : "0",
        transferred: method === "CASH" ? values.transferred : "0", paidFromBatch: method === "CASH" ? values.paidFromBatch : "0",
        independentlyChecked: values.independentlyChecked === "true", segregated: values.segregated === "true" }
        : action === "submit" ? { ...common, action, day: props.day, previousId: props.previousId, checkIds: props.checkIds, countsReaffirmed: values.countsReaffirmed === "true" }
        : { ...common, action, snapshotId: props.previousId, acknowledgeUnresolved: values.acknowledgeUnresolved === "true" };
      const parsed = closingCommandSchema.safeParse(command);
      if (!parsed.success) { setErrors(closingFieldErrors(parsed.error)); setMessage("Check the closing fields below. Values are retained."); feedback.current?.focus(); return; }
      void send(parsed.data);
    }}><fieldset disabled={busy || !ready || !!pending} className="space-y-4">
      {field("action","Action",<select {...attrs("action")} className={selectStyle} value={action} onChange={e => { setAction(e.target.value); setErrors({}); setMessage(""); }}><option value="count">Record independent actual evidence</option>{props.canPrepare && <option value="submit">{props.previousId ? "Submit linked supplement" : "Submit closing snapshot"}</option>}{props.owner && props.previousId && <option value="approve">Acknowledge unresolved differences</option>}</select>)}
      {action === "count" && <>
        {select("collectorId","Actual original collector",props.operators.map(o => [o.id,o.name]))}
        {field("method","Collection method",<select {...attrs("method")} className={selectStyle} value={method} onChange={e => { setMethod(e.target.value); setErrors({}); setMessage(""); }}>{props.canPrepare && <option value="CASH">Cash</option>}<option value="GCASH">GCash</option><option value="BANK">Bank transfer</option></select>)}
        {method !== "CASH" && select("accountId","Independently viewed receiving account",props.accounts.filter(a => a.method === method && a.allowed).map(a => [a.id,a.label]))}
        {field("caseId","Linked member investigation (when identified)",<select {...attrs("caseId")} className={selectStyle}><option value="">Unassigned — retain this closing discrepancy and follow-up notes</option>{props.investigations.map(c => <option key={c.id} value={c.id}>{c.reason}: {c.summary}</option>)}</select>)}
        {input("amount","Independently counted/verified gross actual (PHP)",{inputMode:"decimal"})}
        {method === "CASH" && <div className="grid gap-4 sm:grid-cols-3">{input("cashHeld","Cash physically held from this day (PHP)",{inputMode:"decimal"})}{input("transferred","Evidenced transfers from this batch (PHP)",{inputMode:"decimal"})}{input("paidFromBatch","Evidenced refund payouts from this batch (PHP)",{inputMode:"decimal"})}</div>}
        {attest("independentlyChecked","I physically counted cash or independently checked receiving-account funds; a claim/screenshot alone is insufficient.")}
        {attest("segregated","No opening float or non-membership money is included; evidence allocates each batch portion once to this collector/date.")}
      </>}
      {action === "submit" && <><p id="closing-checkIds" tabIndex={-1} aria-describedby={errors.checkIds ? "closing-error-checkIds" : undefined} className="text-sm outline-offset-4">{props.checkIds.length} current count/account checks selected. Every expected collector/method requires an explicit count; digital checks must cover every receiving account of that method. A supplement preserves the original closing.</p>{errors.checkIds && <p id="closing-error-checkIds" className="text-sm text-destructive">{errors.checkIds}</p>}{!props.ended && <p>This is a preview. Final submission requires the next Manila midnight.</p>}{attest("countsReaffirmed","I reviewed these independent counts, references and differences; the selected actual values still apply to this collection day.")}</>}
      {action === "approve" && attest("acknowledgeUnresolved","I acknowledge every shortage/excess and outstanding item without changing amounts, clearing cases or creating a refund.")}
      {input("evidenceReference","Count / review evidence reference")}{input("notes","Evidence notes, differences and accountable follow-up",{maxLength:500})}
      <Button type="submit" disabled={action === "submit" && !props.ended}>{busy ? "Saving…" : "Save closing record"}</Button>
    </fieldset></form>
  </section>;
}
