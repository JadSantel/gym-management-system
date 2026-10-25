"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReauthenticationForm } from "./reauthentication-form";
import { outageCommandSchema, outageFieldErrors, outageRecoverySchema, type OutageCommand } from "@/lib/outage-schema";
import { formatPhp } from "@/lib/money";

type Recovery = z.infer<typeof outageRecoverySchema>;
type Props = { owner: boolean; operatorId: string; recoveryScope: string; books: { id: string; code: string; firstNumber: number; lastNumber: number }[];
  operators: { id: string; name: string }[]; prices: { id: string; bookId: string; planName: string; durationDays: number; priceCentavos: number }[];
  entries: { id: string; bookId: string; number: number; memberName: string; amountCentavos: number; eligibleVerifier: boolean }[] };
const selectStyle = "min-h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function OutageActions({ owner, books, operators, prices, entries, recoveryScope }: Props) {
  const router = useRouter(); const [action, setAction] = useState("enter"); const [bookId, setBookId] = useState(""); const [visit, setVisit] = useState(false);
  const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [pending, setPending] = useState<Recovery | null>(null); const pendingRef = useRef<Recovery | null>(null);
  const [message, setMessage] = useState(""); const [errors, setErrors] = useState<Record<string, string>>({}); const feedback = useRef<HTMLDivElement>(null);
  const storageKey = `outage-recovery:${recoveryScope}`; const selectedBook = bookId || books[0]?.id || "";
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) { const saved = outageRecoverySchema.parse(JSON.parse(raw)); pendingRef.current = saved; setPending(saved); }
        setReady(true);
      } catch { setMessage("Recovery storage is unavailable. Restore the saved operation before submitting another outage record."); }
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey]);
  async function send(command: OutageCommand, recovery?: Recovery) {
    if (!ready || busyRef.current) return;
    busyRef.current = true; setBusy(true); setMessage(""); setErrors({});
    try {
      if (pendingRef.current && !recovery) throw new Error("Retrieve the saved outage operation first.");
      const saved = recovery ?? { key: crypto.randomUUID(), command };
      sessionStorage.setItem(storageKey, JSON.stringify(saved)); pendingRef.current = saved; setPending(saved);
      const response = await fetch("/api/outage", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": saved.key }, body: JSON.stringify(saved.command) });
      const body = await response.json();
      if (!response.ok) {
        if (response.headers.get("outage-command-outcome") === "not-recorded") { sessionStorage.removeItem(storageKey); pendingRef.current = null; setPending(null); }
        setErrors(body.fieldErrors ?? {}); throw new Error(body.error);
      }
      sessionStorage.removeItem(storageKey); pendingRef.current = null; setPending(null);
      setMessage(body.outcome === "VERIFIED" ? "Outage receipt independently verified. One payment and linked digital receipt recorded with original collection dates."
        : body.outcome === "PENDING" ? "Paper receipt entered pending verification. No new normal membership access granted."
        : body.outcome === "OWNER_REVIEW" ? "Evidence preserved for owner review. No new payment or admission was created."
        : "Outage record saved. Review the registry and custody history below.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connection unavailable. Retrieve the saved operation."); }
    finally { busyRef.current = false; setBusy(false); feedback.current?.focus(); }
  }
  const attributes = (name: string) => ({ id: `outage-${name}`, name, "aria-invalid": !!errors[name], "aria-describedby": errors[name] ? `outage-error-${name}` : undefined });
  const field = (name: string, label: string, element: React.ReactNode) => <div key={name} className="min-w-0"><label htmlFor={`outage-${name}`} className="mb-1 block text-sm font-medium">{label}</label>{element}{errors[name] && <p id={`outage-error-${name}`} className="mt-1 text-sm text-destructive">{errors[name]}</p>}</div>;
  const input = (name: string, label: string, props: React.ComponentProps<typeof Input> = {}) => field(name, label, <Input {...attributes(name)} required maxLength={100} {...props} />);
  const select = (name: string, label: string, options: [string,string][]) => field(name, label, <select {...attributes(name)} required className={selectStyle}><option value="">Choose…</option>{options.map(([id,text]) => <option key={id} value={id}>{text}</option>)}</select>);
  const attest = (name: string, label: string) => <div className="min-w-0 sm:col-span-2">{field(name, label, <input {...attributes(name)} type="checkbox" value="true" required className="mt-2 size-5 accent-primary" />)}</div>;
  const operatorOptions: [string,string][] = operators.map(o => [o.id,o.name]);
  const instant = (name: string, label: string) => input(name, label, { type: "datetime-local", step: "1" });
  return <section className="mt-7 rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="outage-actions-title">
    <h2 id="outage-actions-title" className="text-xl font-semibold">Recover paper records</h2>
    <p className="mt-2 text-sm text-muted-foreground">Use the retained booklet, approved paper price list, cash records and signed handovers. All times below are Asia/Manila. Uncertain historical amounts or dates require owner investigation.</p>
    <div ref={feedback} id="outage-feedback" role="status" tabIndex={-1} className="mt-4 break-words outline-offset-4">
      {message && <p>{message}</p>}{Object.entries(errors).map(([name,text]) => <a key={name} className="mr-3 block text-sm underline" href={`#outage-${name}`}>{text} ({name})</a>)}
    </div>
    {pending && <div className="mt-4 border-l-4 border-primary pl-4"><p className="text-sm">A saved {pending.command.action} operation may have committed. Retrieve it with its original key before another submission.</p><Button className="mt-2" disabled={busy || !ready} onClick={() => void send(pending.command, pending)}>Retrieve saved outage operation</Button></div>}
    {owner && <div className="mt-5"><p id="outage-owner-help" className="mb-2 text-sm">Booklet registration and verifier administration require owner password verification within five minutes.</p><ReauthenticationForm id="outage-owner-password" helpId="outage-owner-help" disabled={busy} /></div>}
    <form className="mt-5" noValidate onSubmit={event => {
      event.preventDefault(); const values: Record<string, unknown> = Object.fromEntries(new FormData(event.currentTarget)); values.action = action;
      if (!["register", "verifier"].includes(action)) values.bookId = selectedBook;
      for (const name of ["first","last","number"]) if (name in values) values[name] = Number(values[name]);
      for (const name of ["collectedAt","issuedAt","actualAt"]) if (name in values) { const date = new Date(`${values[name]}+08:00`); values[name] = Number.isNaN(date.getTime()) ? "" : date.toISOString(); }
      if (action === "handover") for (const name of ["used","unused","void","missing"]) values[name] = String(values[name]).trim() ? String(values[name]).split(",").map(n => Number(n.trim())) : [];
      for (const name of ["historyCertain","bothSigned","independentlyMatched"]) if (name in values) values[name] = values[name] === "true";
      if (action === "verifier") values.active = values.active === "true";
      if (action === "exception" && values.memberId === "") values.memberId = null;
      if (action === "enter") {
        values.method = "CASH"; values.visit = null;
        if (visit) { const date = new Date(`${values.visitAt}+08:00`); values.visit = { at: Number.isNaN(date.getTime()) ? "" : date.toISOString(), authorizerId: values.visitAuthorizerId, reference: values.visitReference }; }
        for (const name of ["visitAt","visitAuthorizerId","visitReference"]) delete values[name];
      }
      const parsed = outageCommandSchema.safeParse(values);
      if (!parsed.success) { const errors = outageFieldErrors(parsed.error); if (errors.visit) { errors.visitAt = errors.visit; delete errors.visit; } setErrors(errors); setMessage("Check the outage fields below."); feedback.current?.focus(); return; }
      void send(parsed.data);
    }}>
      <fieldset disabled={!ready || busy || !!pending} className="grid min-w-0 gap-4 sm:grid-cols-2"><legend className="sr-only">Outage recovery details</legend>
        <div className="min-w-0 sm:col-span-2"><label htmlFor="outage-action" className="block text-sm font-medium">Record type</label><select id="outage-action" value={action} className={selectStyle} onChange={e => { setAction(e.target.value); setErrors({}); }}>
          <option value="enter">Enter full-cash paper receipt</option><option value="handover">Recover signed shift handover</option><option value="exception">Preserve exception / later-visit incident</option><option value="verify">Independently verify a pending receipt</option>{owner && <><option value="register">Register controlled booklet before use</option><option value="verifier">Designate / revoke independent verifier</option></>}
        </select></div>
        {!["register","verifier"].includes(action) && <div className="min-w-0 sm:col-span-2"><label htmlFor="outage-bookId" className="block text-sm font-medium">Controlled booklet</label><select id="outage-bookId" className={selectStyle} value={selectedBook} onChange={e => setBookId(e.target.value)}>{!books.length && <option value="">No registered booklet available</option>}{books.map(book => <option key={book.id} value={book.id}>{book.code} · {book.firstNumber}–{book.lastNumber}</option>)}</select></div>}
        {action === "register" && <>{input("code","Physical booklet code")}{input("first","First pre-numbered leaf",{type:"number",min:1,max:999999999})}{input("last","Last pre-numbered leaf (maximum 200 leaves)",{type:"number",min:1,max:999999999})}{select("custodianId","Assigned cash custodian",operatorOptions)}<p className="text-sm sm:col-span-2">Registration preserves the current approved catalogue as this booklet&apos;s paper price list. Keep a physical copy before the outage. No receipt is issued by this form.</p></>}
        {action === "verifier" && <>{select("operatorId","Operator to designate",operatorOptions)}{select("active","Verification authority",[["true","Designate"],["false","Revoke"]])}</>}
        {["enter","exception"].includes(action) && input("number","Original pre-numbered receipt",{type:"number",min:1,max:999999999})}
        {action === "enter" && <>
          {input("memberId","Member reference",{maxLength:36})}
          {select("priceId","Approved booklet price snapshot",prices.filter(p => p.bookId === selectedBook).map(p => [p.id,`${p.planName} · ${p.durationDays} days · ${formatPhp(p.priceCentavos)}`]))}
          {input("amount","Full cash actually received (PHP)",{inputMode:"decimal"})}{select("collectorId","Original actual collector",operatorOptions)}
          {instant("collectedAt","Original collection time (PHT)")}{instant("issuedAt","Original paper issuance time (PHT)")}
          {input("receiptReference","Retained original receipt evidence reference")}{input("cashReference","Independent original cash record reference")}
          {attest("historyCertain","Historical price and original collection date are unambiguous and match the approved paper records.")}
          <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2"><input id="outage-hasVisit" type="checkbox" checked={visit} onChange={e => setVisit(e.target.checked)} className="size-5 accent-primary" />One provisional visit was documented on the original receipt</label>
          {visit && <>{instant("visitAt","Original one-visit admission time (PHT)")}{select("visitAuthorizerId","Original visit authorizer",operatorOptions)}{input("visitReference","Original one-visit incident reference")}</>}
        </>}
        {action === "handover" && <>
          {select("toId","Incoming identified cash custodian",operatorOptions)}{instant("actualAt","Actual physical handover time (PHT)")}
          {["used","unused","void","missing"].map(name => input(name,`${name[0].toUpperCase()+name.slice(1)} numbers (comma separated; blank means none)`,{required:false,maxLength:2000}))}
          {input("cashHeld","Cash held at handover (PHP; zero allowed)",{inputMode:"decimal"})}{input("cashTransferred","Cash transferred at handover (PHP; zero allowed)",{inputMode:"decimal"})}
          {input("transferReference","Cash transfer / no-transfer record reference")}{input("evidenceReference","Signed physical handover reference")}
          {input("outstanding","Open items, differences and owner escalation reference",{maxLength:500})}{attest("bothSigned","Both custodians physically counted every number and cash, signed the handover, and retained unresolved differences.")}
        </>}
        {action === "exception" && <>
          {select("kind","Exception classification",["VOID","MISSING","INVALID","CONFLICT","LOST_COPY","LATER_VISIT"].map(kind => [kind,kind.replaceAll("_"," ")]))}
          {instant("actualAt","Actual incident time (PHT)")}{input("memberId","Member reference if known (optional)",{required:false,maxLength:36})}{input("evidenceReference","Incident / separate owner decision reference")}{input("reasoning","Known facts, unresolved issues and owner escalation",{maxLength:500})}
          <p className="text-sm sm:col-span-2">This records an incident only. It grants no repeat admission and creates no payment. A lost member copy needs retained receipt, cash and custody corroboration.</p>
        </>}
        {action === "verify" && <>
          {select("entryId","Pending receipt — review its facts below",entries.filter(e => e.bookId === selectedBook).map(e => [e.id,`${e.number} · ${e.memberName} · ${formatPhp(e.amountCentavos)}${e.eligibleVerifier ? "" : " · independent authority unavailable"}`]))}
          {input("receiptEvidence","Independently matched retained receipt reference")}{input("cashEvidence","Independently matched cash record reference")}{input("custodyEvidence","Independently matched signed custody reference")}
          {attest("independentlyMatched","I independently matched the full cash, original receipt, historical price/date and signed custody; I am neither collector nor entrant.")}
        </>}
        <Button type="submit" className="mt-2 sm:col-span-2" disabled={!["register","verifier"].includes(action) && !selectedBook}>{busy ? "Saving…" : "Save outage record"}</Button>
      </fieldset>
    </form>
  </section>;
}
