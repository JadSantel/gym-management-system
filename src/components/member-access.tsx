"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { IdentityFeedback, type IdentityFeedbackState } from "./identity-feedback";

export function MemberAccess({ memberId, initial }: { memberId: string; initial: { state: string; email: string } | null }) {
  const [account, setAccount] = useState(initial), [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<IdentityFeedbackState>({ message: "", error: false });
  async function issue() {
    setBusy(true); setFeedback({ message: "", error: false });
    try {
      const response = await fetch(`/api/members/${memberId}/access`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: account?.state === "ACTIVE" ? "reset" : "invite" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Member setup could not be issued. Try again.");
      const current = await fetch(`/api/members/${memberId}/access`, { cache: "no-store" });
      if (!current.ok) throw new Error("Reload the member profile to confirm the account state before trying again.");
      setAccount(await current.json()); setFeedback({ message: result.status, error: false });
    } catch (error) { setFeedback({ message: error instanceof Error ? error.message : "Member setup not confirmed. Reload the profile before trying again.", error: true }); }
    finally { setBusy(false); }
  }
  return <section className="panel mt-7 space-y-4" aria-labelledby="member-access-title"><h2 id="member-access-title" className="panel-title">Member dashboard access</h2>
    <p className="text-sm text-muted-foreground">Members choose their password during registration and can sign in immediately. Their QR requires paid activation. For profiles without a login, send a private setup link after activation. Setup lasts 48 hours; password recovery lasts 30 minutes. New links replace old links.</p>
    <p className="text-sm">{account ? `Member login: ${account.state === "ACTIVE" ? "Ready" : "Awaiting private setup"} · ${account.email}` : "No member login yet."}</p>
    <p className="text-sm text-muted-foreground">Member contact edits do not change the login email. Live recovery email is not enabled; synthetic messages are captured locally.</p>
    <Button variant="outline" disabled={busy || account?.state === "DISABLED"} onClick={issue}>{busy ? "Preparing member link…" : account?.state === "ACTIVE" ? "Send member password reset" : "Send member setup link"}</Button>
    <IdentityFeedback id="member-access-feedback" feedback={feedback} />
  </section>;
}
