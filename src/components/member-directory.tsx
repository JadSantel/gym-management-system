"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Member = { id: string; fullName: string };
export function MemberDirectory({ initial }: { initial: Member[] }) {
  const [members, setMembers] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>, create: boolean) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const name = String(form.get("name") ?? "");
      const response = await fetch(create ? "/api/members" : `/api/members?q=${encodeURIComponent(name)}`, create ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fullName: name, confirmDuplicate: form.has("confirmDuplicate") }) } : { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          setDuplicate(true);
          const search = await fetch(`/api/members?q=${encodeURIComponent(name)}`);
          if (search.ok) setMembers(await search.json());
        }
        throw new Error(result.error);
      }
      if (create) { setMembers([result]); setDuplicate(false); setMessage("Member created. Review the member record before collecting payment."); }
      else { setMembers(result); setMessage(result.length ? `${result.length} matching members (up to 25 shown).` : "No matching members. You can create a new member below."); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to connect. Try again."); }
    finally { setBusy(false); }
  }
  return <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
    <section aria-labelledby="search-title"><h2 id="search-title" className="mb-4 text-xl font-semibold">Find a member</h2>
      <form onSubmit={event => submit(event, false)} className="mb-5 flex flex-wrap items-end gap-3"><label htmlFor="search-name" className="grow">Member name<Input id="search-name" name="name" type="search" maxLength={100} disabled={busy} /></label><Button type="submit" disabled={busy}>Search</Button></form>
      <ul className="space-y-3">{members.map(member => <li key={member.id} className="rounded-lg border border-border bg-card p-4"><Link href={`/members/${member.id}`} className="font-semibold underline">{member.fullName}</Link><p className="mt-1 break-all text-xs text-muted-foreground">Member reference: {member.id}</p></li>)}</ul>
      {!members.length && <p className="text-muted-foreground">No members to show yet.</p>}
    </section>
    <section aria-labelledby="create-title" className="h-fit rounded-xl border border-border bg-card p-6"><h2 id="create-title" className="mb-2 text-xl font-semibold">Create a member</h2><p className="mb-5 text-sm text-muted-foreground">Search first to avoid duplicates. Only the member name is required.</p>
      <form onSubmit={event => submit(event, true)} className="space-y-4"><label htmlFor="member-name">Full name<Input id="member-name" name="name" required maxLength={100} autoComplete="off" disabled={busy} onChange={() => setDuplicate(false)} /></label>
        {duplicate && <label className="flex min-h-11 items-start gap-3 text-sm"><input name="confirmDuplicate" type="checkbox" required className="mt-1 size-5" />I reviewed the matches. This is a separate person with the same name.</label>}
        <Button type="submit" disabled={busy}>{busy ? "Please wait…" : "Create member"}</Button>
      </form></section>
    <p role="status" className="text-sm text-muted-foreground lg:col-span-2">{message}</p>
  </div>;
}
