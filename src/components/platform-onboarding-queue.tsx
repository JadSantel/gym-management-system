"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type RequestItem = {
  id: string;
  gymName: string;
  ownerName: string;
  email: string;
  state: "PENDING" | "APPROVED" | "DECLINED";
  createdAt: string;
  decidedAt: string | null;
  provisionedGymId: string | null;
  provisionedGym: null | { state: string; operators: { state: string; invitations: { sentAt: string | null; expiresAt: string; consumedAt: string | null }[] }[] };
  canReissue: boolean;
};

export function PlatformOnboardingQueue({ adminName }: { adminName: string }) {
  const router = useRouter();
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    fetch("/api/platform/onboarding", { cache: "no-store" }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error("Unable to load onboarding requests.");
      if (current) setRequests(result as RequestItem[]);
    }).catch(() => { if (current) setLoadError("Unable to load requests. Try again."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [reload]);

  async function decide(request: RequestItem, decision: "APPROVE" | "DECLINE") {
    if (decision === "DECLINE" && !window.confirm(`Decline the request for ${request.gymName}?`)) return;
    setBusyId(request.id); setActionMessage("");
    try {
      const response = await fetch("/api/platform/onboarding", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: request.id, decision, syntheticOwnershipVerified: decision === "APPROVE" && !!verified[request.id] }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save the review decision.");
      setActionMessage(result.invitation === "captured" ? "Request approved. The synthetic setup invitation was captured." : `Request ${String(result.status).toLowerCase()}.`);
      setLoading(true); setLoadError("");
      setReload(value => value + 1);
    } catch (error) { setActionMessage(error instanceof Error ? error.message : "Unable to save the review decision."); }
    finally { setBusyId(""); }
  }

  async function reissue(request: RequestItem) {
    setBusyId(request.id); setActionMessage("");
    try {
      const response = await fetch("/api/platform/onboarding/retry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId: request.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to reissue the setup invitation.");
      setActionMessage(result.status === "captured" ? "A new synthetic setup invitation was captured." : "Invitation delivery is still pending.");
      setLoading(true); setLoadError("");
      setReload(value => value + 1);
    } catch (error) { setActionMessage(error instanceof Error ? error.message : "Unable to reissue the setup invitation."); }
    finally { setBusyId(""); }
  }

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.replace("/platform/login"); router.refresh();
  }

  return <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b pb-5">
      <div><p className="text-sm text-muted-foreground">Platform administration</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Gym onboarding</h1><p className="mt-1 text-sm text-muted-foreground">Signed in as {adminName}</p></div>
      <Button variant="outline" onClick={signOut}>Sign out</Button>
    </header>
    <div className="mb-6 rounded-lg border border-border bg-muted/50 p-4 text-sm leading-6 text-muted-foreground">
      Synthetic-only review. Do not enter real owner information. Real ownership approval remains disabled until its verification, evidence, privacy, and email procedures are approved.
    </div>
    {actionMessage && <p role="status" className="mb-4 rounded-md border bg-card p-3 text-sm">{actionMessage}</p>}
    {loadError && <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-destructive/40 p-3 text-sm" role="alert"><span>{loadError}</span><Button variant="outline" onClick={() => { setLoading(true); setLoadError(""); setReload(value => value + 1); }}>Try again</Button></div>}
    {loading ? <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading requests…</CardContent></Card>
      : requests.length === 0 ? <Card><CardContent className="p-6"><h2 className="font-medium">No requests yet</h2><p className="mt-1 text-sm text-muted-foreground">New synthetic requests will appear here after submission.</p></CardContent></Card>
      : <div className="grid gap-4">{requests.map(request => {
        const owner = request.provisionedGym?.operators[0];
        const invitation = owner?.invitations[0];
        const canReissue = request.canReissue;
        return <Card key={request.id}><CardContent className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-start sm:p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{request.gymName}</h2><Badge variant={request.state === "PENDING" ? "outline" : "secondary"}>{request.state}</Badge></div>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Owner</dt><dd className="mt-0.5 break-words">{request.ownerName}</dd></div>
              <div><dt className="text-muted-foreground">Email</dt><dd className="mt-0.5 break-all">{request.email}</dd></div>
              <div><dt className="text-muted-foreground">Requested</dt><dd className="mt-0.5">{new Date(request.createdAt).toLocaleString()}</dd></div>
              {request.state === "APPROVED" && <div><dt className="text-muted-foreground">Setup</dt><dd className="mt-0.5">{invitation?.consumedAt ? "Completed" : invitation?.sentAt ? "Invitation captured" : "Invitation pending"}</dd></div>}
            </dl>
            {request.state === "PENDING" && <label className="mt-5 flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" checked={!!verified[request.id]} onChange={event => setVerified(current => ({ ...current, [request.id]: event.target.checked }))} className="size-4 accent-primary" />
              I completed the synthetic ownership review for this test request.
            </label>}
          </div>
          <div className="flex flex-col gap-2 sm:min-w-40">
            {request.state === "PENDING" && <>
              <Button disabled={busyId === request.id || !verified[request.id]} onClick={() => decide(request, "APPROVE")}>{busyId === request.id ? "Saving…" : "Approve and invite"}</Button>
              <Button variant="outline" disabled={busyId === request.id} onClick={() => decide(request, "DECLINE")}>Decline request</Button>
            </>}
            {canReissue && <Button variant="outline" disabled={busyId === request.id} onClick={() => reissue(request)}>Reissue setup invitation</Button>}
          </div>
        </CardContent></Card>;
      })}</div>}
  </div>;
}
