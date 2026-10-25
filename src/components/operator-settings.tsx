"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReauthenticationForm } from "@/components/reauthentication-form";
import { IdentityFeedback, type IdentityFeedbackState } from "@/components/identity-feedback";
import { identityRequest, IdentityRequestError } from "@/lib/client";
import { identitySchemas, identityFieldErrors, type IdentityFieldErrors } from "@/lib/identity-schema";
type Operator = { id: string; role: string; state: string; canManageMembers: boolean; canCollectCash: boolean; user: { name: string; email: string; username: string | null; emailVerified: boolean } };
type StaffAction = "invite" | "reset-staff" | "disable" | "capabilities";

export function OperatorSettings() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<IdentityFeedbackState>({ message: "", error: false });
  const [errors, setErrors] = useState<IdentityFieldErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [errorContext, setErrorContext] = useState<{ action: StaffAction; id?: string }>({ action: "invite" });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useEffect(() => { identityRequest("operators").then(setOperators).catch(() => setFeedback({ message: "Unable to load operators. Refresh to try again.", error: true })); }, []);
  async function act(action: StaffAction, body: object, id?: string) {
    setBusy(true); setFeedback({ message: "", error: false }); setErrors({}); setErrorContext({ action, id });
    if (action === "invite") setAttempted(true);
    try {
      const parsed = identitySchemas[action].safeParse(body);
      if (!parsed.success) { setErrors(identityFieldErrors(parsed.error)); setFeedback({ message: "Check the account fields below.", error: true }); return; }
      const result = await identityRequest(action, parsed.data);
      const captureFailed = result.status === "pending";
      const message = action === "disable" ? "Staff disabled. Current sessions and links revoked." : action === "capabilities" ? "Staff permissions saved. Changes apply to the next protected request." : captureFailed
        ? action === "reset-staff" ? "Email capture failed. Staff access is unchanged; retry the reset link." : "Email capture failed. Account remains pending; retry the invitation."
        : "Link captured for the recipient. Sending a link does not activate the account.";
      setConfirmId(null);
      // A list-read failure must not turn a completed mutation into a failed/retry claim.
      try { setOperators(await identityRequest("operators")); setFeedback({ message, error: captureFailed }); }
      catch { setFeedback({ message: `${message} Unable to reload operators. Refresh to see the current list.`, error: true }); }
    } catch (error) {
      if (error instanceof IdentityRequestError) setErrors(error.fieldErrors);
      setFeedback({ message: error instanceof Error ? error.message : "Unable to connect. Try again.", error: true });
    }
    finally { setBusy(false); }
  }
  const inviteErrors = errorContext.action === "invite" ? errors : {};
  const targets = errorContext.action === "invite" ? { name: "staff-name", email: "staff-email", username: "staff-username" }
    : { operatorId: `${errorContext.action}-${errorContext.id}`, canManageMembers: `members-${errorContext.id}`, canCollectCash: `cash-${errorContext.id}` };
  const links = Object.entries(errors).flatMap(([field, message]) => {
    const id = targets[field as keyof typeof targets];
    return id && message ? [{ id, label: message }] : [];
  });
  if (feedback.error && feedback.message.includes("Verify your password again")) links.push({ id: "reauth-password", label: "Verify owner password, then retry your action" });
  function correct(field: "name" | "email" | "username", value: string) {
    if (!attempted || errorContext.action !== "invite") return;
    const result = identitySchemas.invite.shape[field].safeParse(value);
    setErrors(previous => ({ ...previous, [field]: result.success ? undefined : result.error.issues[0].message }));
  }
  return <div className="mt-10 space-y-8">
    <section aria-labelledby="reauth-title" className="rounded-xl border border-border bg-card p-6"><h2 id="reauth-title" className="text-xl font-semibold">Verify before account changes</h2><p id="reauth-help" className="mb-5 mt-2 text-sm text-muted-foreground">Verify your owner password to invite, reset, or disable staff. Verification lasts five minutes.</p>
      <ReauthenticationForm id="reauth-password" helpId="reauth-help" disabled={busy} /></section>
    <IdentityFeedback id="operator-feedback" feedback={feedback} links={links} />
    <section aria-labelledby="invite-title" className="rounded-xl border border-border bg-card p-6"><h2 id="invite-title" className="mb-5 text-xl font-semibold">Invite staff</h2>
      <form noValidate aria-busy={busy} onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); await act("invite", { name: data.get("name"), email: data.get("email"), username: data.get("username") }); }} className="grid gap-4 sm:grid-cols-2">
        <label htmlFor="staff-name">Full name<Input id="staff-name" name="name" required maxLength={100} autoComplete="off" disabled={busy} aria-invalid={!!inviteErrors.name} aria-describedby={inviteErrors.name ? "staff-name-error" : undefined} onChange={event => correct("name", event.target.value)} />
          {inviteErrors.name && <span id="staff-name-error" className="text-sm text-destructive">{inviteErrors.name}</span>}</label>
        <label htmlFor="staff-username">Username<Input id="staff-username" name="username" required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]{3,30}" autoCapitalize="none" autoComplete="off" aria-describedby={`username-help${inviteErrors.username ? " staff-username-error" : ""}`} aria-invalid={!!inviteErrors.username} disabled={busy} onChange={event => correct("username", event.target.value)} />
          {inviteErrors.username && <span id="staff-username-error" className="text-sm text-destructive">{inviteErrors.username}</span>}</label>
        <p id="username-help" className="text-sm text-muted-foreground sm:col-span-2">Username: 3–30 letters, numbers, or underscores.</p>
        <label htmlFor="staff-email" className="sm:col-span-2">Email<Input id="staff-email" name="email" type="email" required maxLength={254} autoComplete="off" aria-describedby={`invite-help${inviteErrors.email ? " staff-email-error" : ""}`} aria-invalid={!!inviteErrors.email} disabled={busy} onChange={event => correct("email", event.target.value)} />
          {inviteErrors.email && <span id="staff-email-error" className="text-sm text-destructive">{inviteErrors.email}</span>}</label>
        <p id="invite-help" className="text-sm text-muted-foreground sm:col-span-2">Synthetic development accepts reserved .test addresses. Staff choose their private password through a 48-hour, single-use link. Submit the same pending account details to replace its invitation.</p>
        <Button type="submit" disabled={busy} className="sm:justify-self-start">Send invitation</Button>
      </form></section>
    <section aria-labelledby="operators-title"><h2 id="operators-title" className="mb-4 text-xl font-semibold">Operators</h2><ul className="space-y-3">{operators.map(operator => {
      const rowErrors = errorContext.id === operator.id ? errors : {};
      return <li key={operator.id} className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h3 className="font-semibold">{operator.user.name}</h3><p className="break-all text-sm text-muted-foreground">{operator.user.email}{operator.user.username ? ` · ${operator.user.username}` : ""}</p><p className="mt-2 text-sm">{operator.role === "OWNER" ? "Owner" : "Staff"} · {operator.state === "ACTIVE" ? "Active · Email verified" : operator.state === "PENDING" ? "Pending setup" : "Disabled"}</p></div>
      {operator.role === "STAFF" && operator.state !== "DISABLED" && <div className="flex flex-wrap gap-2">{operator.state === "ACTIVE" && <Button id={`reset-staff-${operator.id}`} variant="outline" disabled={busy} aria-describedby={rowErrors.operatorId ? `operator-error-${operator.id}` : undefined} onClick={() => act("reset-staff", { operatorId: operator.id }, operator.id)}>Send reset link</Button>}<Button variant="outline" disabled={busy} onClick={() => setConfirmId(operator.id)}>Disable staff</Button></div>}</div>
      {rowErrors.operatorId && <p id={`operator-error-${operator.id}`} className="mt-2 text-sm text-destructive">{rowErrors.operatorId}</p>}
      {confirmId === operator.id && <div className="mt-4 rounded-md border border-border bg-muted p-4"><p className="mb-3 text-sm">Disable {operator.user.name}? Current sessions and unused setup/reset links will stop working immediately.</p><div className="flex gap-3"><Button id={`disable-${operator.id}`} variant="destructive" disabled={busy} aria-describedby={rowErrors.operatorId ? `operator-error-${operator.id}` : undefined} onClick={() => act("disable", { operatorId: operator.id }, operator.id)}>Confirm disable</Button><Button variant="outline" disabled={busy} onClick={() => setConfirmId(null)}>Cancel</Button></div></div>}
      {operator.role === "STAFF" && operator.state === "ACTIVE" && <form key={`${operator.id}-${operator.canManageMembers}-${operator.canCollectCash}`} className="mt-5 flex flex-wrap items-center gap-4 border-t border-border pt-4" onSubmit={async event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        await act("capabilities", { operatorId: operator.id, canManageMembers: form.has("members"), canCollectCash: form.has("cash") }, operator.id);
      }} aria-busy={busy} aria-label={`Permissions for ${operator.user.name}`}>
        <label className="flex min-h-11 items-center gap-2"><input id={`members-${operator.id}`} type="checkbox" name="members" defaultChecked={operator.canManageMembers} disabled={busy} className="size-5" aria-invalid={!!rowErrors.canManageMembers} aria-describedby={rowErrors.canManageMembers ? `members-error-${operator.id}` : undefined} onChange={() => setErrors(previous => ({ ...previous, canManageMembers: undefined }))} />Manage members</label>
        {rowErrors.canManageMembers && <p id={`members-error-${operator.id}`} className="text-sm text-destructive">{rowErrors.canManageMembers}</p>}
        <label className="flex min-h-11 items-center gap-2"><input id={`cash-${operator.id}`} type="checkbox" name="cash" defaultChecked={operator.canCollectCash} disabled={busy} className="size-5" aria-invalid={!!rowErrors.canCollectCash} aria-describedby={rowErrors.canCollectCash ? `cash-error-${operator.id}` : undefined} onChange={() => setErrors(previous => ({ ...previous, canCollectCash: undefined }))} />Confirm full cash</label>
        {rowErrors.canCollectCash && <p id={`cash-error-${operator.id}`} className="text-sm text-destructive">{rowErrors.canCollectCash}</p>}
        <Button id={`capabilities-${operator.id}`} type="submit" variant="outline" disabled={busy} aria-describedby={rowErrors.operatorId ? `operator-error-${operator.id}` : undefined}>Save permissions</Button>
      </form>}
    </li>; })}</ul></section>
  </div>;
}
