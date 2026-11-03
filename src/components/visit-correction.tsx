"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { correctionSchema } from "@/lib/attendance-schema";
function localTime(instant: string) { return new Date(Date.parse(instant) + 8 * 3600000).toISOString().slice(0, 23); }
export function VisitCorrection({ id, revision, arrivedAt, departedAt }: { id: string; revision: number; arrivedAt: string; departedAt: string | null }) {
  const router = useRouter(), pending = useRef<Record<string, unknown> | null>(null), feedback = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      if (!pending.current) {
        const parsed = correctionSchema.safeParse(form.get("action") === "void" ? { action: "void", visitId: id, revision, reason: form.get("reason"), requestId: crypto.randomUUID() }
          : { action: "correct", visitId: id, revision, reason: form.get("reason"), arrivedAt: form.get("arrival") ? `${form.get("arrival")}+08:00` : "", departedAt: form.get("departure") ? `${form.get("departure")}+08:00` : null, requestId: crypto.randomUUID() });
        if (!parsed.success) { setMessage("Enter a required reason and valid PHT times before saving."); return; }
        pending.current = parsed.data;
      }
      const response = await fetch("/api/attendance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pending.current) });
      const result = await response.json();
      if (!response.ok) { if (response.status >= 500) throw new Error(); if (!uncertain) pending.current = null; setMessage(result.error); }
      else { pending.current = null; setUncertain(false); setMessage("Audited change saved. Original events are preserved."); router.refresh(); }
    } catch { setUncertain(true); setMessage("Correction not confirmed. Retry the same change when connected, or reload the history to check its revision."); }
    finally { setBusy(false); requestAnimationFrame(() => feedback.current?.focus()); }
  }
  return <details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 font-medium">Correct or void this visit</summary>
    <form noValidate onSubmit={submit} className="mt-3 grid min-w-0 grid-cols-1 gap-4" aria-busy={busy}>
      <label htmlFor={`action-${id}`}>Action<select id={`action-${id}`} name="action" disabled={busy || uncertain} className="min-h-11 w-full rounded-md border border-input bg-card px-3"><option value="correct">Correct recorded times</option><option value="void">Void accidental visit</option></select></label>
      <label htmlFor={`arrival-${id}`}>Arrival (PHT)<Input id={`arrival-${id}`} name="arrival" type="datetime-local" className="min-w-0" step="0.001" defaultValue={localTime(arrivedAt)} disabled={busy || uncertain} /></label>
      <label htmlFor={`departure-${id}`}>Departure (PHT, blank if unrecorded)<Input id={`departure-${id}`} name="departure" type="datetime-local" className="min-w-0" step="0.001" defaultValue={departedAt ? localTime(departedAt) : ""} disabled={busy || uncertain} /></label>
      <label htmlFor={`reason-${id}`}>Required reason<Input id={`reason-${id}`} name="reason" maxLength={500} required disabled={busy || uncertain} /></label>
      <p className="text-sm text-muted-foreground">Revision {revision}. Future, reversed, overlapping and conflicting changes are rejected. This cannot create a missed historical visit.</p>
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : uncertain ? "Retry same correction" : "Save audited change"}</Button>
      <p ref={feedback} tabIndex={-1} role="status" className="text-sm outline-offset-4">{message}</p>
    </form>
  </details>;
}
