"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { identityRequest } from "@/lib/client";
type Operator = { id: string; role: string; state: string; canManageMembers: boolean; canCollectCash: boolean; user: { name: string; email: string; username: string | null; emailVerified: boolean } };

export function OperatorSettings() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useEffect(() => { identityRequest("operators").then(setOperators).catch(() => setMessage("Unable to load operators. Refresh to try again.")); }, []);
  async function act(action: string, body: object) {
    setBusy(true); setMessage("");
    try {
      const result = await identityRequest(action, body);
      setMessage(action === "reauthenticate" ? "Password verified for five minutes." : action === "disable" ? "Staff disabled. Current sessions and links revoked." : action === "capabilities" ? "Staff permissions saved. Changes apply to the next protected request." : result.status === "pending" ? "Email capture failed. Account remains pending; retry the invitation." : "Link captured for the recipient. Sending a link does not activate the account.");
      setOperators(await identityRequest("operators"));
      setConfirmId(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to connect. Try again."); }
    finally { setBusy(false); }
  }
  return <div className="mt-10 space-y-8">
    <section aria-labelledby="reauth-title" className="rounded-xl border border-border bg-card p-6"><h2 id="reauth-title" className="text-xl font-semibold">Verify before account changes</h2><p id="reauth-help" className="mb-5 mt-2 text-sm text-muted-foreground">Verify your owner password to invite, reset, or disable staff. Verification lasts five minutes.</p>
      <form onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const password = new FormData(form).get("password"); await act("reauthenticate", { password }); form.reset(); }} className="flex flex-wrap items-end gap-3">
        <label htmlFor="reauth-password" className="min-w-48 grow">Owner password<Input id="reauth-password" name="password" type="password" autoComplete="current-password" required maxLength={128} aria-describedby="reauth-help" disabled={busy} /></label><Button type="submit" disabled={busy}>Verify password</Button>
      </form></section>
    <p role="status" className="text-sm text-muted-foreground">{message}</p>
    <section aria-labelledby="invite-title" className="rounded-xl border border-border bg-card p-6"><h2 id="invite-title" className="mb-5 text-xl font-semibold">Invite staff</h2>
      <form onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); await act("invite", { name: data.get("name"), email: data.get("email"), username: data.get("username") }); }} className="grid gap-4 sm:grid-cols-2">
        <label htmlFor="staff-name">Full name<Input id="staff-name" name="name" required maxLength={100} autoComplete="off" disabled={busy} /></label>
        <label htmlFor="staff-username">Username<Input id="staff-username" name="username" required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]{3,30}" autoCapitalize="none" autoComplete="off" aria-describedby="username-help" disabled={busy} /></label>
        <p id="username-help" className="text-sm text-muted-foreground sm:col-span-2">Username: 3–30 letters, numbers, or underscores.</p>
        <label htmlFor="staff-email" className="sm:col-span-2">Email<Input id="staff-email" name="email" type="email" required maxLength={254} autoComplete="off" aria-describedby="invite-help" disabled={busy} /></label>
        <p id="invite-help" className="text-sm text-muted-foreground sm:col-span-2">Synthetic development accepts reserved .test addresses. Staff choose their private password through a 48-hour, single-use link. Submit the same pending account details to replace its invitation.</p>
        <Button type="submit" disabled={busy} className="sm:justify-self-start">Send invitation</Button>
      </form></section>
    <section aria-labelledby="operators-title"><h2 id="operators-title" className="mb-4 text-xl font-semibold">Operators</h2><ul className="space-y-3">{operators.map(operator => <li key={operator.id} className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h3 className="font-semibold">{operator.user.name}</h3><p className="break-all text-sm text-muted-foreground">{operator.user.email}{operator.user.username ? ` · ${operator.user.username}` : ""}</p><p className="mt-2 text-sm">{operator.role === "OWNER" ? "Owner" : "Staff"} · {operator.state === "ACTIVE" ? "Active · Email verified" : operator.state === "PENDING" ? "Pending setup" : "Disabled"}</p></div>
      {operator.role === "STAFF" && operator.state !== "DISABLED" && <div className="flex flex-wrap gap-2">{operator.state === "ACTIVE" && <Button variant="outline" disabled={busy} onClick={() => act("reset-staff", { operatorId: operator.id })}>Send reset link</Button>}<Button variant="outline" disabled={busy} onClick={() => setConfirmId(operator.id)}>Disable staff</Button></div>}</div>
      {confirmId === operator.id && <div className="mt-4 rounded-md border border-border bg-muted p-4"><p className="mb-3 text-sm">Disable {operator.user.name}? Current sessions and unused setup/reset links will stop working immediately.</p><div className="flex gap-3"><Button variant="destructive" disabled={busy} onClick={() => act("disable", { operatorId: operator.id })}>Confirm disable</Button><Button variant="outline" disabled={busy} onClick={() => setConfirmId(null)}>Cancel</Button></div></div>}
      {operator.role === "STAFF" && operator.state === "ACTIVE" && <form key={`${operator.id}-${operator.canManageMembers}-${operator.canCollectCash}`} className="mt-5 flex flex-wrap items-center gap-4 border-t border-border pt-4" onSubmit={async event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        await act("capabilities", { operatorId: operator.id, canManageMembers: form.has("members"), canCollectCash: form.has("cash") });
      }} aria-label={`Permissions for ${operator.user.name}`}>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="members" defaultChecked={operator.canManageMembers} disabled={busy} className="size-5" />Manage members</label>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="cash" defaultChecked={operator.canCollectCash} disabled={busy} className="size-5" />Confirm full cash</label>
        <Button type="submit" variant="outline" disabled={busy}>Save permissions</Button>
      </form>}
    </li>)}</ul></section>
  </div>;
}
