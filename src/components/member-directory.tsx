"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assessEligibility } from "@/lib/eligibility";
import { WorkspaceIcon } from "@/components/workspace-icon";
import { memberCreateSchema, memberFieldErrors, memberSearchSchema, type MemberFieldErrors } from "@/lib/member-schema";
type Member = { id: string; fullName: string; entitlements?: { startsAt: string; endsAt: string; legacyRecordId: string | null }[] };
export function MemberDirectory({ initial, desk = false, checkedAt }: { initial: Member[]; desk?: boolean; checkedAt: string }) {
  const [members, setMembers] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [createErrors, setCreateErrors] = useState<MemberFieldErrors>({});
  const [searchError, setSearchError] = useState("");
  const [createAttempted, setCreateAttempted] = useState(false);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [filter, setFilter] = useState("All");
  const [checkTime, setCheckTime] = useState(checkedAt);
  const status = (member: Member) => assessEligibility((member.entitlements ?? []).map(interval => ({ ...interval, startsAt: new Date(interval.startsAt), endsAt: new Date(interval.endsAt) })), new Date(checkTime));
  const labels = { ELIGIBLE: "Active", SCHEDULED: "Scheduled", EXPIRED: "Expired", NOT_ELIGIBLE: "No membership" };
  const visible = members.filter(member => filter === "All" || labels[status(member).status] === filter);
  useEffect(() => { if (feedback.error) feedbackRef.current?.focus(); }, [feedback]);
  async function submit(event: React.FormEvent<HTMLFormElement>, create: boolean) {
    event.preventDefault(); setBusy(true); setFeedback({ message: "", error: false });
    setCreateErrors({}); setSearchError("");
    const form = new FormData(event.currentTarget);
    try {
      const name = String(form.get("name") ?? "");
      const input = { fullName: name, confirmDuplicate: form.has("confirmDuplicate") };
      if (create) {
        setCreateAttempted(true);
        const parsed = memberCreateSchema.safeParse(input);
        if (!parsed.success) { setCreateErrors(memberFieldErrors(parsed.error)); throw new Error("Check the member fields below."); }
        if (duplicate && !input.confirmDuplicate) {
          setCreateErrors({ confirmDuplicate: "Confirm that you reviewed the matches and this is a separate person." });
          throw new Error("Review the matching members before creating another person.");
        }
      } else {
        setSearchAttempted(true);
        const parsed = memberSearchSchema.safeParse(name);
        if (!parsed.success) { setSearchError(parsed.error.issues[0].message); throw new Error("Check the member search below."); }
      }
      const response = await fetch(create ? "/api/members" : `/api/members?q=${encodeURIComponent(name)}`, create ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) } : { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        if (create) setCreateErrors(result.fieldErrors ?? {});
        else setSearchError(result.fieldErrors?.q ?? "");
        if (response.status === 409) {
          setDuplicate(true);
          const search = await fetch(`/api/members?q=${encodeURIComponent(name)}`);
          if (search.ok) setMembers(await search.json());
        }
        throw new Error(result.error);
      }
      setCheckTime(new Date().toISOString()); setFilter("All");
      if (create) { setMembers([result]); setDuplicate(false); setFeedback({ message: "Member created. Review the member record before collecting payment.", error: false }); }
      else { setMembers(result); setFeedback({ message: result.length ? `${result.length} matching members (up to 25 shown).` : "No matching members. You can create a new member below.", error: false }); }
    } catch (error) { setFeedback({ message: error instanceof Error ? error.message : "Unable to connect. Try again.", error: true }); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <div id="member-feedback" ref={feedbackRef} tabIndex={-1} role={feedback.error ? "alert" : "status"} className={`text-sm outline-offset-4 ${feedback.message ? "panel" : ""}`}>
      {feedback.message}
      {searchError && <a href="#search-name" className="ml-2 underline">Review member search</a>}
      {createErrors.fullName && <a href="#member-name" className="ml-2 underline">Review full name</a>}
      {createErrors.confirmDuplicate && <a href="#duplicate-review" className="ml-2 underline">Review duplicate confirmation</a>}
    </div>
    <section className="panel" aria-labelledby="search-title"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="search-title" className="panel-title">{desk ? "Find a member" : "Member directory"}</h2><p className="text-xs text-muted-foreground">Up to 25 matches · Search to refresh eligibility</p></div>
      <form noValidate onSubmit={event => submit(event, false)} className="mb-5 flex flex-wrap items-end gap-3"><label htmlFor="search-name" className="grow">Member name<Input id="search-name" name="name" type="search" maxLength={100} disabled={busy}
        aria-invalid={!!searchError} aria-describedby={searchError ? "search-name-error" : undefined} onChange={event => {
          if (searchAttempted) { const parsed = memberSearchSchema.safeParse(event.currentTarget.value); setSearchError(parsed.success ? "" : parsed.error.issues[0].message); }
        }} /></label><Button type="submit" disabled={busy}>Search</Button>
        {searchError && <p id="search-name-error" className="w-full text-sm text-destructive">{searchError}</p>}
      </form>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-border pb-3" role="group" aria-label="Filter displayed members">{["All", "Active", "Expired", "Scheduled", "No membership"].map(label => <Button key={label} variant="outline" aria-pressed={filter === label} className={filter === label ? "border-foreground bg-muted" : "border-transparent bg-transparent text-muted-foreground"} onClick={() => setFilter(label)}>{label}</Button>)}</div>
      <ul className={desk ? "grid gap-3 md:grid-cols-2" : "divide-y divide-border"}>{visible.map(member => {
        const eligibility = status(member);
        const future = member.entitlements?.some(interval => new Date(interval.startsAt) > new Date(checkTime));
        return <li key={member.id} className={desk ? "rounded-lg border border-border p-4" : "flex flex-wrap items-center justify-between gap-4 py-4"}><div className="flex min-w-0 items-start gap-3"><span className="initial-avatar" aria-hidden="true">{member.fullName.split(" ").map(word => word[0]).slice(0, 2).join("")}</span><div className="min-w-0"><Link href={`/members/${member.id}`} className="break-words font-semibold hover:underline">{member.fullName}</Link><p className="mt-1 break-all text-xs text-muted-foreground">Member reference: {member.id}</p><p className="mt-2 text-xs text-muted-foreground">{eligibility.interval ? `${eligibility.status === "SCHEDULED" ? "Starts" : "Expiry"}: ${new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(eligibility.status === "SCHEDULED" ? eligibility.interval.startsAt : eligibility.interval.endsAt)} PHT` : "No verified paid period"}{future && eligibility.status === "ELIGIBLE" ? " · Paid next term scheduled" : ""}</p></div></div>
          <div className={`flex flex-wrap items-center gap-3 ${desk ? "mt-4" : ""}`}><span className={`status-label ${eligibility.status === "ELIGIBLE" ? "success" : eligibility.status === "SCHEDULED" ? "attention" : eligibility.status === "EXPIRED" ? "danger" : ""}`}>{labels[eligibility.status]}</span><Link href={`/members/${member.id}`} className="action-link secondary">Profile<WorkspaceIcon name="arrow" className="size-3.5" /></Link></div>
        </li>;
      })}</ul>
      {!visible.length && <p className="py-10 text-center text-muted-foreground">{members.length ? "No members match this filter. Choose another status." : "No members to show yet."}</p>}
      <p className="mt-4 text-xs text-muted-foreground">Eligibility checked {new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(checkTime))} PHT. Open a profile for the current access decision before admission.</p>
    </section>
    <section id="new-member" aria-labelledby="create-title" className="panel"><h2 id="create-title" className="panel-title">Create a member</h2><p className="mb-5 mt-2 text-sm text-muted-foreground">Search first to avoid duplicates. Creating a member records no payment and grants no paid access.</p>
      <form noValidate onSubmit={event => submit(event, true)} className="space-y-4"><label htmlFor="member-name">Full name<Input id="member-name" name="name" required maxLength={100} autoComplete="off" disabled={busy}
        aria-invalid={!!createErrors.fullName} aria-describedby={createErrors.fullName ? "member-name-error" : undefined} onChange={event => {
          setDuplicate(false);
          const parsed = memberCreateSchema.shape.fullName.safeParse(event.currentTarget.value);
          setCreateErrors(createAttempted && !parsed.success ? { fullName: parsed.error.issues[0].message } : {});
        }} /></label>
        {createErrors.fullName && <p id="member-name-error" className="text-sm text-destructive">{createErrors.fullName}</p>}
        {duplicate && <><label className="flex min-h-11 items-start gap-3 text-sm"><input id="duplicate-review" name="confirmDuplicate" type="checkbox" required disabled={busy} className="mt-1 size-5"
          aria-invalid={!!createErrors.confirmDuplicate} aria-describedby={createErrors.confirmDuplicate ? "duplicate-review-error" : undefined}
          onChange={event => setCreateErrors(event.currentTarget.checked ? {} : { confirmDuplicate: "Confirm that you reviewed the matches and this is a separate person." })} />I reviewed the matches. This is a separate person with the same name.</label>
          {createErrors.confirmDuplicate && <p id="duplicate-review-error" className="text-sm text-destructive">{createErrors.confirmDuplicate}</p>}
        </>}
        <Button type="submit" disabled={busy}>{busy ? "Please wait…" : "Create member"}</Button>
      </form></section>
  </div>;
}
