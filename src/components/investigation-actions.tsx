"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReauthenticationForm } from "./reauthentication-form";
import { caseReasons, investigationCommandSchema, investigationFieldErrors, type InvestigationCommand } from "@/lib/investigation-schema";
import { formatPhp } from "@/lib/money";

const recoverySchema = z.strictObject({ key: z.uuid(), command: investigationCommandSchema });
type Recovery = z.infer<typeof recoverySchema>;
const selectStyle = "min-h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
type Props = { recoveryScope: string; memberId?: string; caseId?: string; revision?: number; owner?: boolean;
  payments?: { id: string; reference: string; amountCentavos: number; periodId: string }[]; requests?: { id: string; reason: string }[];
  plans?: [string, string][]; collectors?: [string, string][]; approvals?: [string, string][]; approvedRequests?: [string, string][]; executions?: [string, string][] };

export function InvestigationActions({ recoveryScope, memberId, caseId, revision, owner, payments = [], requests = [], plans = [], collectors = [], approvals = [], approvedRequests = [], executions = [] }: Props) {
  const router = useRouter(); const [action, setAction] = useState("note");
  const [busy, setBusy] = useState(false); const busyRef = useRef(false); const [ready, setReady] = useState(false);
  const [message, setMessage] = useState(""); const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Recovery | null>(null); const pendingRef = useRef<Recovery | null>(null);
  const feedback = useRef<HTMLDivElement>(null); const storageKey = `investigation-recovery:${recoveryScope}`;
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) { const saved = recoverySchema.parse(JSON.parse(raw)); pendingRef.current = saved; setPending(saved); }
        setReady(true);
      } catch { setMessage("Case recovery storage is unavailable. Restore this tab's saved operation before submitting another record."); }
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey]);
  async function send(command: InvestigationCommand, recovery?: Recovery) {
    if (busyRef.current || !ready) return;
    busyRef.current = true; setBusy(true); setErrors({}); setMessage("");
    try {
      if (pendingRef.current && !recovery) throw new Error("Retrieve the original case operation first.");
      const saved = recovery ?? { key: crypto.randomUUID(), command };
      sessionStorage.setItem(storageKey, JSON.stringify(saved)); pendingRef.current = saved; setPending(saved);
      const response = await fetch("/api/investigations", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": saved.key }, body: JSON.stringify(command) });
      const body = await response.json();
      if (!response.ok) {
        if (response.headers.get("case-command-outcome") === "not-recorded") { sessionStorage.removeItem(storageKey); pendingRef.current = null; setPending(null); }
        setErrors(body.fieldErrors ?? {}); throw new Error(body.error);
      }
      sessionStorage.removeItem(storageKey); pendingRef.current = null; setPending(null);
      setMessage(body.outcome === "APPROVED_BLOCKED" ? "Owner approval recorded. Execution remains blocked; no money or access changed." : body.outcome === "AWAITING_SETTLEMENT" ? "Approved access outcome executed. Refund awaits independently verified external settlement. The CRM has not transferred money." : body.outcome === "RECOVERED" ? "Verified omitted cash payment recovered with original collection dates. Receipt and membership period recorded." : body.outcome === "COMPLETED" ? "Approved operation completed and recorded in the preserved history." : "Case record saved. Review its outcome and next required action below.");
      if (command.action === "open") router.push(`/investigations/${body.caseId}`);
      else router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connection unavailable. Retry the saved case operation to retrieve its result."); }
    finally { busyRef.current = false; setBusy(false); feedback.current?.focus(); }
  }
  const mode = caseId ? action : "open";
  const field = (name: string, label: string, input: React.ReactNode) => <div className="min-w-0"><label htmlFor={`case-${name}`} className="block text-sm font-medium">{label}</label>{input}{errors[name] && <p id={`case-error-${name}`} className="mt-1 text-sm text-destructive">{errors[name]}</p>}</div>;
  const attributes = (name: string) => ({ id: `case-${name}`, name, "aria-invalid": !!errors[name], "aria-describedby": errors[name] ? `case-error-${name}` : undefined });
  const input = (name: string, label: string, options: React.ComponentProps<typeof Input> = {}) => field(name, label, <Input {...attributes(name)} required {...options} />);
  const attest = (name: string, label: string) => <label className="flex min-h-11 items-center gap-3 sm:col-span-2" htmlFor={`case-${name}`}><input {...attributes(name)} type="checkbox" value="true" required />{label}</label>;
  const select = (name: string, label: string, options: [string, string][], optional = false) => field(name, label, <select {...attributes(name)} required={!optional} className={selectStyle}>{optional && <option value="">Not specified</option>}{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>);
  const paymentOptions = payments.map(payment => [payment.id, `${payment.reference} · ${formatPhp(payment.amountCentavos)}`] as [string, string]);
  const periodOptions = payments.map(payment => [payment.periodId, `Period for ${payment.reference}`] as [string, string]);
  return <section className="mt-7 rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="case-action-title">
    <h2 id="case-action-title" className="text-xl font-semibold">{caseId ? "Add investigation record" : "Open an investigation"}</h2>
    <p className="mt-2 text-sm text-muted-foreground">Use synthetic facts and opaque evidence references only. Never enter passwords, OTPs, account credentials or evidence contents.</p>
    <div id="case-feedback" ref={feedback} tabIndex={-1} role="status" className="mt-3 break-words text-sm"><p>{message}</p>
      {Object.keys(errors).length > 0 && <ul className="mt-2 list-disc pl-5">{Object.entries(errors).map(([name, text]) => <li key={name}><a className="underline" href={`#case-${name}`}>{name}: {text}</a></li>)}</ul>}
    </div>
    {pending && <div className="mt-4 rounded-md border border-border p-4"><p>Case status unknown. Retrieve the saved operation before submitting another record.</p><Button className="mt-3" disabled={!ready || busy} onClick={() => send(pending.command, pending)}>Retry original case operation</Button></div>}
    {owner && caseId && <div className="my-5"><p id="case-owner-help" className="mb-2 text-sm">Owner decisions require password verification within five minutes.</p><ReauthenticationForm id="case-owner-password" helpId="case-owner-help" /></div>}
    <form className="mt-4" aria-busy={busy} onSubmit={event => {
      event.preventDefault(); if (busyRef.current || !ready || pendingRef.current) return;
      const values: Record<string, unknown> = Object.fromEntries(new FormData(event.currentTarget));
      values.action = mode;
      if (caseId) { values.caseId = caseId; values.expectedRevision = revision; }
      for (const name of ["originalCollectedAt", "effectiveAt", "adjustedStartsAt", "adjustedEndsAt", "settledAt"]) if (typeof values[name] === "string" && values[name]) {
        const date = new Date(`${values[name]}+08:00`); values[name] = Number.isNaN(date.getTime()) ? "" : date.toISOString();
      }
      for (const name of ["evidenceReference", "originalCollectedAt", "claimedAmount", "relatedPaymentId", "retainedPeriodId", "independentEvidenceReference", "adjustedStartsAt", "adjustedEndsAt"]) if (values[name] === "") delete values[name];
      for (const name of ["independentlyVerified", "originalDateVerified", "omittedPaymentVerified", "sameObligation", "unintendedCollection"]) if (values[name] === "true") values[name] = true;
      const parsed = investigationCommandSchema.safeParse(values);
      if (!parsed.success) { setErrors(investigationFieldErrors(parsed.error)); setMessage("Check the case fields below."); feedback.current?.focus(); return; }
      void send(parsed.data);
    }}>
      <fieldset disabled={!ready || busy || !!pending} className="grid min-w-0 gap-4 sm:grid-cols-2"><legend className="sr-only">Investigation details</legend>
        {caseId && <div className="sm:col-span-2"><label htmlFor="case-action" className="block text-sm font-medium">Record type</label><select id="case-action" className={selectStyle} value={action} onChange={event => { setAction(event.target.value); setErrors({}); }}>
          <option value="note">Investigation note</option><option value="escalate">Escalate to owner</option><option value="link" disabled={!payments.length}>Match an existing payment</option><option value="request" disabled={!payments.length}>Request correction or refund review</option>{owner && <option value="review" disabled={!requests.length}>Owner decision on a request</option>}
          {owner && <><option value="approveRecovery">Approve verified omitted cash recovery</option><option value="recover" disabled={!approvals.length}>Execute approved cash recovery</option><option value="executeApproved" disabled={!approvedRequests.length}>Execute approved correction or refund</option><option value="settle" disabled={!executions.length}>Verify external refund settlement</option></>}
        </select></div>}
        {caseId && !payments.length && <p className="text-sm sm:col-span-2">No confirmed payment is recorded for this member. Investigate and escalate; the owner may approve independently verified omitted full cash recovery.</p>}
        {mode === "open" && <>
          {input("memberId", "Member reference", { defaultValue: memberId, maxLength: 36 })}
          {select("reason", "Case classification", Object.entries(caseReasons))}
          {input("summary", "Claim summary (no evidence contents)", { maxLength: 500 })}
          {select("method", "Claimed collection method", [["UNKNOWN", "Unknown"], ["CASH", "Cash"], ["GCASH", "GCash"], ["BANK", "Bank"]])}
          {input("originalCollectedAt", "Reported original collection time (PHT, optional)", { type: "datetime-local", step: "1", required: false })}
          {input("claimedAmount", "Claimed amount (PHP, optional)", { inputMode: "decimal", required: false })}
        </>}
        {mode !== "open" && input("reasoning", "Reviewer reasoning / investigation outcome", { maxLength: 500 })}
        {input("evidenceReference", mode === "open" ? "Evidence reference (optional for uncorroborated claims)" : "Evidence reference", { maxLength: 100, required: mode !== "open" })}
        {["approveRecovery", "executeApproved", "settle", "request"].includes(mode) && input("independentEvidenceReference", "Distinct independent corroboration reference", { maxLength: 100, required: mode !== "request" })}
        {["approveRecovery", "executeApproved", "settle"].includes(mode) && attest("independentlyVerified", "I independently verified actual collection or external settlement; verbal claims and screenshots alone are insufficient.")}
        {mode === "approveRecovery" && <>
          {select("planId", "Verified original full-price plan", plans)}{select("collectorId", "Original actual collector", collectors)}
          {attest("originalDateVerified", "Original collection date/time is independently verified and unambiguous.")}
          {attest("omittedPaymentVerified", "I checked payment and receipt history: this collection was genuinely omitted. Approve creation of one linked cash payment and its displayed original-date membership period.")}
        </>}
        {mode === "recover" && select("approvalEventId", "Approved recovery (review exact plan, amount and period below)", approvals)}
        {mode === "executeApproved" && select("requestEventId", "Exact approved proposal to execute", approvedRequests)}
        {mode === "settle" && <>
          {select("executionEventId", "Refund awaiting settlement", executions)}
          {input("amount", "Actual full refund amount (PHP)", { inputMode: "decimal" })}
          {select("method", "Actual settlement method", [["CASH", "Cash"], ["GCASH", "GCash"], ["BANK", "Bank"]])}
          {input("settlementReference", "Unique external settlement reference", { maxLength: 100 })}
          {input("settledAt", "Actual independently verified settlement time (PHT)", { type: "datetime-local", step: "1" })}
          <p className="text-sm sm:col-span-2">Record verified external money movement only. Owner approval alone is insufficient. The CRM does not transfer funds.</p>
        </>}
        {(mode === "link" || mode === "request") && select("paymentId", "Existing confirmed payment", paymentOptions)}
        {mode === "request" && <>
          {select("reason", "Correction / refund classification", Object.entries(caseReasons).filter(([key]) => key !== "MISSING_PAYMENT"))}
          {select("relatedPaymentId", "Other confirmed payment (duplicate or excess collection)", paymentOptions, true)}
          {select("collectionCount", "Actual collections supported by evidence", [["UNKNOWN", "Unresolved"], ["ONE", "One actual collection"], ["TWO", "Two actual collections"]])}
          {select("moneyOutcome", "Proposed financial outcome", [["NO_MOVEMENT", "No money movement"], ["REFUND_PROPOSED", "Refund proposed, not completed"], ["CORRECTION_PROPOSED", "Financial correction proposed"]])}
          {input("amount", "Proposed amount (PHP; zero for no movement)", { inputMode: "decimal", defaultValue: "0.00" })}
          {select("method", "Proposed money method", [["CASH", "Cash"], ["GCASH", "GCash"], ["BANK", "Bank"]])}
          {select("periodId", "Affected original paid period", periodOptions)}
          {select("retainedPeriodId", "Retained period from other payment (duplicate record)", periodOptions, true)}
          {select("accessOutcome", "Explicit proposed access outcome", [["STAYS", "Access stays"], ["ENDS", "Access ends"], ["ADJUSTS", "Access adjusts; details in reasoning"]])}
          {input("effectiveAt", "Proposed access effective date and time (PHT)", { type: "datetime-local", step: "1" })}
          {input("adjustedStartsAt", "Explicit adjusted start (PHT; required for ADJUSTS)", { type: "datetime-local", step: "1", required: false })}
          {input("adjustedEndsAt", "Explicit adjusted end (PHT; required for ADJUSTS)", { type: "datetime-local", step: "1", required: false })}
          <label className="flex min-h-11 items-center gap-3"><input {...attributes("sameObligation")} type="checkbox" value="true" />Evidence proves both collections relate to the same obligation</label>
          <label className="flex min-h-11 items-center gap-3"><input {...attributes("unintendedCollection")} type="checkbox" value="true" />Evidence proves the full additional collection was unintended</label>
          <p className="text-sm sm:col-span-2">Identify affected and retained periods explicitly. One collection with duplicate records moves zero money. Refund execution supports only the exact full evidenced unintended duplicate excess. Discretionary cancellations remain blocked.</p>
        </>}
        {mode === "review" && <>
          {select("requestEventId", "Request to review (read its full proposal below)", requests.map(request => [request.id, `${request.id} · ${request.reason}`]))}
          {select("decision", "Owner decision on this exact proposal", [["REJECT", "Reject request"], ["APPROVE", "Approve exact proposal"]])}
          <p className="text-sm sm:col-span-2">Approval records agreement with the selected request&apos;s money, periods, access outcome and effective date. Supported proposals require separate execution; refunds then await verified external settlement. Unsupported procedures remain blocked.</p>
        </>}
        <Button type="submit" className="sm:col-span-2">{busy ? "Saving…" : mode === "open" ? "Open case without granting access" : "Save case record"}</Button>
      </fieldset>
    </form>
  </section>;
}
