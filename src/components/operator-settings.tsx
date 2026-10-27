"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ReauthenticationForm } from "@/components/reauthentication-form";
import { IdentityFeedback, type IdentityFeedbackState } from "@/components/identity-feedback";
import { identityRequest, IdentityRequestError } from "@/lib/client";
import { identitySchemas, identityFieldErrors, type IdentityFieldErrors } from "@/lib/identity-schema";
type Operator = { id: string; role: string; state: string; canManageMembers: boolean; canCollectCash: boolean; user: { name: string; email: string; username: string | null; emailVerified: boolean } };
type StaffAction = "invite" | "reset-staff" | "disable" | "capabilities";

export function OperatorSettings() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const disableTrigger = useRef<HTMLButtonElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<IdentityFeedbackState>({ message: "", error: false });
  const [errors, setErrors] = useState<IdentityFieldErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [errorContext, setErrorContext] = useState<{ action: StaffAction; id?: string }>({ action: "invite" });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    identityRequest("operators").then(result => { if (active) setOperators(result); })
      .catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);
  useEffect(() => { if (confirmId) document.getElementById(`disable-${confirmId}`)?.focus(); }, [confirmId]);
  function cancelDisable() { setConfirmId(null); disableTrigger.current?.focus(); }
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
      try { setOperators(await identityRequest("operators")); setLoadError(false); setFeedback({ message, error: captureFailed }); }
      catch { setLoadError(true); setFeedback({ message: `${message} Unable to reload operators. Refresh to see the current list.`, error: true }); }
      if (action === "disable") document.getElementById("operators-title")?.focus();
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
  return <div className="space-y-6">
    <IdentityFeedback id="operator-feedback" feedback={feedback} links={links} />
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section aria-labelledby="operators-title" className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-5">
          <div><h2 id="operators-title" tabIndex={-1} className="text-lg font-semibold outline-offset-4">Operators</h2>
            <p className="mt-1 text-sm text-muted-foreground">Individual accounts. Clear responsibilities.</p></div>
          {!loading && !loadError && <Badge variant="secondary">{operators.length} {operators.length === 1 ? "operator" : "operators"}</Badge>}
        </div>
        {loading && <div role="status" className="space-y-4 p-6"><p className="text-sm text-muted-foreground">Loading operators…</p><div aria-hidden="true" className="h-14 rounded-md bg-muted" /><div aria-hidden="true" className="h-14 rounded-md bg-muted" /></div>}
        {loadError && <div role="alert" className="space-y-3 border-b border-border p-6"><p className="text-sm text-destructive">Unable to load operators. Retry to see the current list.</p><Button variant="outline" disabled={loading || busy} onClick={() => { setLoading(true); setLoadError(false); setReload(value => value + 1); }}>Retry loading operators</Button></div>}
        {!loading && !loadError && operators.length === 0 && <div className="p-6"><p className="font-medium">No operators to display</p><p className="mt-2 text-sm text-muted-foreground">Invite staff using their individual email and username. If you expected existing accounts, refresh the list.</p></div>}
        {!loading && <ul className="divide-y divide-border">{operators.map(operator => {
          const rowErrors = errorContext.id === operator.id ? errors : {};
          const rowBusy = busy && errorContext.id === operator.id;
          return <li key={operator.id} className="p-6" aria-busy={rowBusy}>
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">{operator.user.name.slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0"><h3 className="break-words text-sm font-semibold">{operator.user.name}</h3><p className="mt-1 break-all text-sm text-muted-foreground">{operator.user.email}</p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">{operator.role === "OWNER" ? "Owner" : "Staff"}{operator.user.username ? ` · ${operator.user.username}` : ""}</p></div>
              </div>
              <Badge variant="secondary" className={operator.state === "ACTIVE" ? "bg-success-surface text-success" : operator.state === "PENDING" ? "bg-attention-surface text-attention" : "bg-muted text-muted-foreground"}>{operator.state === "ACTIVE" ? "Active · Email verified" : operator.state === "PENDING" ? "Pending setup" : "Disabled"}</Badge>
            </div>
            {operator.role === "OWNER" && <p className="mt-4 text-xs text-muted-foreground">Owner-controlled account administration. Digital verification requires a separate receiving-account grant.</p>}
            {rowErrors.operatorId && <p id={`operator-error-${operator.id}`} className="mt-2 text-sm text-destructive">{rowErrors.operatorId}</p>}
            {operator.role === "STAFF" && operator.state === "ACTIVE" && <form key={`${operator.id}-${operator.canManageMembers}-${operator.canCollectCash}`} className="mt-5 space-y-3" onSubmit={async event => {
              event.preventDefault(); const form = new FormData(event.currentTarget);
              await act("capabilities", { operatorId: operator.id, canManageMembers: form.has("members"), canCollectCash: form.has("cash") }, operator.id);
            }} aria-busy={busy} aria-label={`Permissions for ${operator.user.name}`}>
              <fieldset disabled={busy} className="flex flex-wrap gap-x-5 gap-y-1"><legend className="mb-1 text-xs font-medium text-muted-foreground">Permissions</legend>
                <label className="flex min-h-11 items-center gap-2"><input id={`members-${operator.id}`} type="checkbox" name="members" defaultChecked={operator.canManageMembers} className="size-4" aria-invalid={!!rowErrors.canManageMembers} aria-describedby={rowErrors.canManageMembers ? `members-error-${operator.id}` : undefined} onChange={() => setErrors(previous => ({ ...previous, canManageMembers: undefined }))} />Manage members</label>
                <label className="flex min-h-11 items-center gap-2"><input id={`cash-${operator.id}`} type="checkbox" name="cash" defaultChecked={operator.canCollectCash} className="size-4" aria-invalid={!!rowErrors.canCollectCash} aria-describedby={rowErrors.canCollectCash ? `cash-error-${operator.id}` : undefined} onChange={() => setErrors(previous => ({ ...previous, canCollectCash: undefined }))} />Confirm full cash</label>
              </fieldset>
              {rowErrors.canManageMembers && <p id={`members-error-${operator.id}`} className="text-sm text-destructive">{rowErrors.canManageMembers}</p>}
              {rowErrors.canCollectCash && <p id={`cash-error-${operator.id}`} className="text-sm text-destructive">{rowErrors.canCollectCash}</p>}
              <Button id={`capabilities-${operator.id}`} type="submit" variant="outline" disabled={busy} aria-describedby={rowErrors.operatorId ? `operator-error-${operator.id}` : undefined}>{rowBusy && errorContext.action === "capabilities" ? "Saving permissions…" : "Save permissions"}</Button>
            </form>}
            {operator.role === "STAFF" && operator.state !== "DISABLED" && <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
              {operator.state === "ACTIVE" && <Button id={`reset-staff-${operator.id}`} variant="outline" disabled={busy} aria-describedby={rowErrors.operatorId ? `operator-error-${operator.id}` : undefined} onClick={() => act("reset-staff", { operatorId: operator.id }, operator.id)}>{rowBusy && errorContext.action === "reset-staff" ? "Requesting reset…" : "Send reset link"}</Button>}
              <Button variant="outline" className="text-destructive" disabled={busy} aria-expanded={confirmId === operator.id} aria-controls={`disable-confirmation-${operator.id}`} onClick={event => { disableTrigger.current = event.currentTarget; setConfirmId(operator.id); }}>Disable staff</Button>
            </div>}
            {confirmId === operator.id && <div id={`disable-confirmation-${operator.id}`} className="mt-4 rounded-lg bg-muted p-4" onKeyDown={event => { if (event.key === "Escape" && !busy) { event.preventDefault(); cancelDisable(); } }}>
              <p className="mb-3 text-sm">Disable {operator.user.name}? Current sessions and unused setup/reset links will stop working immediately.</p>
              <div className="flex flex-wrap gap-3"><Button id={`disable-${operator.id}`} variant="destructive" disabled={busy} aria-describedby={rowErrors.operatorId ? `operator-error-${operator.id}` : undefined} onClick={() => act("disable", { operatorId: operator.id }, operator.id)}>{rowBusy && errorContext.action === "disable" ? "Disabling…" : "Confirm disable"}</Button><Button variant="outline" disabled={busy} onClick={cancelDisable}>Cancel</Button></div>
            </div>}
          </li>;
        })}</ul>}
        <div className="border-t border-border px-6 py-4 text-xs leading-relaxed text-muted-foreground">Permissions are checked for every protected request. Pending and disabled accounts cannot access the workspace.</div>
      </section>
      <div className="grid min-w-0 gap-6 md:grid-cols-2 xl:grid-cols-1">
        <section aria-labelledby="invite-title" className="min-w-0">
          <Card><CardHeader><h2 id="invite-title" className="text-lg font-semibold">Invite staff</h2><p className="text-sm text-muted-foreground">Give each person their own account.</p></CardHeader><CardContent>
            <form noValidate aria-busy={busy} onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); await act("invite", { name: data.get("name"), email: data.get("email"), username: data.get("username") }); }} className="grid gap-4">
              <label htmlFor="staff-name">Full name<Input id="staff-name" name="name" required maxLength={100} autoComplete="off" disabled={busy} aria-invalid={!!inviteErrors.name} aria-describedby={inviteErrors.name ? "staff-name-error" : undefined} onChange={event => correct("name", event.target.value)} />{inviteErrors.name && <span id="staff-name-error" className="text-sm text-destructive">{inviteErrors.name}</span>}</label>
              <label htmlFor="staff-username">Username<Input id="staff-username" name="username" required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]{3,30}" autoCapitalize="none" autoComplete="off" aria-describedby={`username-help${inviteErrors.username ? " staff-username-error" : ""}`} aria-invalid={!!inviteErrors.username} disabled={busy} onChange={event => correct("username", event.target.value)} />{inviteErrors.username && <span id="staff-username-error" className="text-sm text-destructive">{inviteErrors.username}</span>}</label>
              <p id="username-help" className="-mt-2 text-xs text-muted-foreground">Username: 3–30 letters, numbers, or underscores.</p>
              <label htmlFor="staff-email">Email<Input id="staff-email" name="email" type="email" required maxLength={254} autoComplete="off" aria-describedby={`invite-help${inviteErrors.email ? " staff-email-error" : ""}`} aria-invalid={!!inviteErrors.email} disabled={busy} onChange={event => correct("email", event.target.value)} />{inviteErrors.email && <span id="staff-email-error" className="text-sm text-destructive">{inviteErrors.email}</span>}</label>
              <p id="invite-help" className="text-xs leading-relaxed text-muted-foreground">Use a reserved .test address in synthetic development. Staff choose a private password through a 48-hour, single-use link. Submit the same pending account details to replace its invitation.</p>
              <Button type="submit" disabled={busy}>{busy && errorContext.action === "invite" ? "Sending invitation…" : "Send invitation"}</Button>
            </form>
          </CardContent></Card>
        </section>
        <section aria-labelledby="reauth-title" className="min-w-0">
          <Card className="bg-sidebar"><CardHeader><h2 id="reauth-title" className="flex items-start gap-2 text-lg font-semibold"><svg aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></svg>Verify before account changes</h2></CardHeader><CardContent><p id="reauth-help" className="mb-4 text-sm leading-relaxed text-muted-foreground">Verify your owner password to invite, change permissions, reset, or disable staff. Verification lasts five minutes.</p><ReauthenticationForm id="reauth-password" helpId="reauth-help" disabled={busy} /></CardContent></Card>
        </section>
      </div>
    </div>
  </div>;
}
