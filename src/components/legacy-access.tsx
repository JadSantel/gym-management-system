"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ReauthenticationForm } from "./reauthentication-form";
import { legacyCommandSchema, legacyFieldErrors, legacyRecoverySchema, type LegacyCommand } from "@/lib/legacy-schema";

type Saved = { key: string; command: LegacyCommand };
export function LegacyAccess({ memberId, owner, scope, proposals, records }: {
  memberId: string; owner: boolean; scope: string; proposals: { id: string; label: string }[]; records: { id: string; label: string }[];
}) {
  const router = useRouter(); const [action, setAction] = useState("prepare");
  const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [saved, setSaved] = useState<Saved | null>(null); const pending = useRef<Saved | null>(null);
  const [message, setMessage] = useState(""); const [errors, setErrors] = useState<Record<string,string>>({});
  const feedback = useRef<HTMLDivElement>(null); const storageKey = `legacy-recovery:${scope}:${memberId}`;
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) { const value = legacyRecoverySchema.parse(JSON.parse(raw)); pending.current = value; setSaved(value); }
        setReady(true);
      } catch { setMessage("Restore the saved legacy operation before starting another. Recovery storage is unavailable."); }
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey]);
  async function send(command: LegacyCommand, retry?: Saved) {
    if (!ready || lock.current) return;
    lock.current = true; setBusy(true); setMessage(""); setErrors({});
    try {
      if (pending.current && !retry) throw new Error("Retrieve the saved legacy operation first.");
      const value = retry ?? { key: crypto.randomUUID(), command };
      sessionStorage.setItem(storageKey, JSON.stringify(value)); pending.current = value; setSaved(value);
      const response = await fetch("/api/legacy", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": value.key }, body: JSON.stringify(value.command) });
      const result = await response.json();
      if (!response.ok) {
        if (response.headers.get("legacy-command-outcome") === "not-recorded") { sessionStorage.removeItem(storageKey); pending.current = null; setSaved(null); }
        setErrors(result.fieldErrors ?? {}); throw new Error(result.error);
      }
      sessionStorage.removeItem(storageKey); pending.current = null; setSaved(null);
      setMessage(result.kind === "APPROVE" ? "Historical access approved. No collection or receipt was created." : "Legacy evidence saved. Only approved independent evidence grants access.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connection unavailable. Retrieve the saved operation."); }
    finally { lock.current = false; setBusy(false); feedback.current?.focus(); }
  }
  const attrs = (name: string) => ({ id: `legacy-${name}`, name, "aria-invalid": !!errors[name], "aria-describedby": errors[name] ? `legacy-error-${name}` : undefined });
  const field = (name: string, label: string, node: React.ReactNode) => <div key={name} className="min-w-0"><label htmlFor={`legacy-${name}`} className="mb-1 block text-sm font-medium">{label}</label>{node}{errors[name] && <p id={`legacy-error-${name}`} className="mt-1 text-sm text-destructive">{errors[name]}</p>}</div>;
  const input = (name: string, label: string, required = true) => field(name,label,<Input {...attrs(name)} required={required} maxLength={100} />);
  const select = (name: string, label: string, options: { id: string; label: string }[], optional = false) => field(name,label,<select {...attrs(name)} required={!optional} className="min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base"><option value="">{optional ? "None" : "Choose…"}</option>{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>);
  return <section className="mt-7 rounded-xl border border-border bg-card p-6" aria-labelledby="legacy-title">
    <h2 id="legacy-title" className="text-xl font-semibold">Reviewed historical access</h2>
    <p className="mt-2 text-sm">Prepare independent historical sources for owner review. Uncertain evidence grants no access. This workflow creates no payment, receipt or unpaid balance.</p>
    {owner && <div className="mt-4"><p id="legacy-owner-help" className="mb-2 text-sm">Owner decisions require password verification within five minutes.</p><ReauthenticationForm id="legacy-owner-password" helpId="legacy-owner-help" disabled={busy} /></div>}
    <div ref={feedback} id="legacy-feedback" tabIndex={-1} role="status" className="mt-4 break-words focus:outline-2 focus:outline-ring">{message}{Object.entries(errors).length > 0 && <ul>{Object.entries(errors).map(([key,value]) => <li key={key}><a className="underline" href={`#legacy-${key}`}>{value}</a></li>)}</ul>}</div>
    {saved && <Button className="mt-3" disabled={busy || !ready} onClick={() => send(saved.command,saved)}>Retrieve saved legacy operation</Button>}
    <form className="mt-4" noValidate onSubmit={event => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
      const raw = action === "prepare" ? { action, memberId, previousId: values.previousId || null, sourceReference: values.sourceReference,
        sourceType: values.sourceType, corroboratingReference: values.corroboratingReference || null, interpretation: values.interpretation,
        claimedStart: values.claimedStart || null, claimedEnd: values.claimedEnd || null, uncertainty: values.uncertainty, notes: values.notes }
        : { action, proposalId: values.proposalId, decision: values.decision, independentlyChecked: values.independentlyChecked === "true", notes: values.notes };
      const parsed = legacyCommandSchema.safeParse(raw);
      if (!parsed.success) { setErrors(legacyFieldErrors(parsed.error)); setMessage("Check the historical evidence fields."); feedback.current?.focus(); return; }
      void send(parsed.data);
    }}>
      <fieldset disabled={!ready || busy || !!saved} className="grid min-w-0 gap-4 sm:grid-cols-2"><legend className="sr-only">Legacy evidence and review</legend>
        {owner && field("action","Legacy action",<select {...attrs("action")} value={action} onChange={e => { setAction(e.target.value); setErrors({}); setMessage(""); }} className="min-h-11 w-full rounded-md border border-input bg-card px-3"><option value="prepare">Prepare historical evidence</option><option value="review">Review historical proposal</option></select>)}
        {action === "prepare" ? <>
          {input("sourceReference","Independent gym source reference")}
          {select("sourceType","Gym source type",["GYM_REGISTER","ACCESS_CARD","ACCESS_AGREEMENT"].map(id => ({id,label:id.replaceAll("_"," ")})))}
          {input("corroboratingReference","Separate corroborating source reference",false)}
          {select("interpretation","Source interval meaning",[{id:"VALID_THROUGH_DATES",label:"Start date and inclusive valid-through date"},{id:"INSTANTS",label:"Explicit start/end instants (end exclusive)"}])}
          {input("claimedStart","Claimed start (YYYY-MM-DD or ISO instant with offset)",false)}
          {input("claimedEnd","Claimed end / valid-through (same format)",false)}
          {select("uncertainty","Evidence certainty",["CERTAIN","CONFLICTING_EXPIRY","UNSUPPORTED_PAYMENT","UNPAID_BALANCE","AMBIGUOUS_INTERVAL"].map(id => ({id,label:id.replaceAll("_"," ")})))}
          {select("previousId","Previous evidence / decision (optional)",records,true)}
        </> : <>
          {select("proposalId","Undecided historical proposal",proposals)}
          {select("decision","Owner decision",[{id:"APPROVE",label:"Approve exact independently verified interval"},{id:"FLAG",label:"Flag for further review — no access"},{id:"REJECT",label:"Reject — preserve evidence, no access"}])}
          {field("independentlyChecked","I independently checked the referenced sources",<input {...attrs("independentlyChecked")} type="checkbox" value="true" className="size-5 accent-primary" />)}
        </>}
        {field("notes","Evidence / uncertainty / decision reason",<textarea {...attrs("notes")} required maxLength={500} className="min-h-24 w-full rounded-md border border-input bg-card p-3" />)}
        <Button type="submit" className="self-end">Save historical evidence</Button>
      </fieldset>
    </form>
  </section>;
}
