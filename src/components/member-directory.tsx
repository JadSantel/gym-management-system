"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { memberCreateSchema, memberFieldErrors, memberSearchSchema, type MemberFieldErrors } from "@/lib/member-schema";
type Member = { id: string; fullName: string };
export function MemberDirectory({ initial }: { initial: Member[] }) {
  const [members, setMembers] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [createErrors, setCreateErrors] = useState<MemberFieldErrors>({});
  const [searchError, setSearchError] = useState("");
  const [createAttempted, setCreateAttempted] = useState(false);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
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
      if (create) { setMembers([result]); setDuplicate(false); setFeedback({ message: "Member created. Review the member record before collecting payment.", error: false }); }
      else { setMembers(result); setFeedback({ message: result.length ? `${result.length} matching members (up to 25 shown).` : "No matching members. You can create a new member below.", error: false }); }
    } catch (error) { setFeedback({ message: error instanceof Error ? error.message : "Unable to connect. Try again.", error: true }); }
    finally { setBusy(false); }
  }
  return <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
    <div id="member-feedback" ref={feedbackRef} tabIndex={-1} role={feedback.error ? "alert" : "status"} className="text-sm outline-offset-4 lg:col-span-2">
      {feedback.message}
      {searchError && <a href="#search-name" className="ml-2 underline">Review member search</a>}
      {createErrors.fullName && <a href="#member-name" className="ml-2 underline">Review full name</a>}
      {createErrors.confirmDuplicate && <a href="#duplicate-review" className="ml-2 underline">Review duplicate confirmation</a>}
    </div>
    <section aria-labelledby="search-title"><h2 id="search-title" className="mb-4 text-xl font-semibold">Find a member</h2>
      <form noValidate onSubmit={event => submit(event, false)} className="mb-5 flex flex-wrap items-end gap-3"><label htmlFor="search-name" className="grow">Member name<Input id="search-name" name="name" type="search" maxLength={100} disabled={busy}
        aria-invalid={!!searchError} aria-describedby={searchError ? "search-name-error" : undefined} onChange={event => {
          if (searchAttempted) { const parsed = memberSearchSchema.safeParse(event.currentTarget.value); setSearchError(parsed.success ? "" : parsed.error.issues[0].message); }
        }} /></label><Button type="submit" disabled={busy}>Search</Button>
        {searchError && <p id="search-name-error" className="w-full text-sm text-destructive">{searchError}</p>}
      </form>
      <ul className="space-y-3">{members.map(member => <li key={member.id} className="rounded-lg border border-border bg-card p-4"><Link href={`/members/${member.id}`} className="font-semibold underline">{member.fullName}</Link><p className="mt-1 break-all text-xs text-muted-foreground">Member reference: {member.id}</p></li>)}</ul>
      {!members.length && <p className="text-muted-foreground">No members to show yet.</p>}
    </section>
    <section aria-labelledby="create-title" className="h-fit rounded-xl border border-border bg-card p-6"><h2 id="create-title" className="mb-2 text-xl font-semibold">Create a member</h2><p className="mb-5 text-sm text-muted-foreground">Search first to avoid duplicates. Only the member name is required.</p>
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
