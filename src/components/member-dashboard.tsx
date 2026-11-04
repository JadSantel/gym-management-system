"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, LogOut, RefreshCw } from "lucide-react";
import type { memberDashboard } from "@/lib/member-access";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { IdentityFeedback, type IdentityFeedbackState } from "./identity-feedback";

type Dashboard = Awaited<ReturnType<typeof memberDashboard>>;
export function MemberDashboard({ data }: { data: Dashboard }) {
  const router = useRouter(), [refreshing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false), [expired, setExpired] = useState(false);
  const [feedback, setFeedback] = useState<IdentityFeedbackState>({ message: "", error: false });
  useEffect(() => {
    if (data.status !== "ELIGIBLE" || !data.endsAt) return;
    const cutoff = performance.now() + Math.max(0, Date.parse(data.endsAt) - Date.parse(data.checkedAt));
    let timer: ReturnType<typeof setTimeout>;
    function checkExpiry() {
      const remaining = cutoff - performance.now();
      if (remaining <= 0) { setExpired(true); router.refresh(); }
      else timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
    }
    timer = setTimeout(checkExpiry, Math.max(0, Math.min(cutoff - performance.now(), 2_147_483_647)));
    return () => clearTimeout(timer);
  }, [data.endsAt, data.checkedAt, data.status, router]);
  async function signOut() {
    setBusy(true); setFeedback({ message: "", error: false });
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error();
      router.replace("/member/login"); router.refresh();
    } catch { setBusy(false); setFeedback({ message: "Sign out was not confirmed. Try again before leaving this device.", error: true }); }
  }
  const active = data.status === "ELIGIBLE" && !expired;
  const label = expired ? "Expired" : { ELIGIBLE: "Active", EXPIRED: "Expired", SCHEDULED: "Scheduled", NOT_ELIGIBLE: "Pending activation" }[data.status];
  return <div className="mx-auto w-full max-w-xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight">My Gym QR</h1><p className="mt-2 text-muted-foreground">{data.gym}</p></div><Button variant="outline" onClick={signOut} disabled={busy}><LogOut aria-hidden="true" className="size-4" />{busy ? "Signing out…" : "Sign out"}</Button></div>
    <IdentityFeedback id="member-dashboard-feedback" feedback={feedback} />
    <Card className="shadow-none"><CardContent className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-5"><div><h2 className="text-xl font-semibold">{data.name}</h2><p className="mt-1 text-sm text-muted-foreground">Your membership</p></div><Badge variant="outline" className={active ? "border-transparent bg-success-surface text-success" : "border-transparent bg-attention-surface text-attention"}>{label}</Badge></div>
      {active && data.qr ? <div className="grid justify-items-center gap-5 text-center">
        {/* Black-on-white QR content must stay readable in either theme. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={data.qr} width={280} height={280} alt="Your personal attendance QR" className="h-auto w-70 max-w-full rounded-md" />
        <p className="max-w-sm text-sm leading-relaxed">Show this QR to front-desk staff when entering or leaving the gym. Staff will confirm the person presenting it.</p>
        <a href="/api/member/qr" download="my-gym-qr.png" className="action-link"><Download aria-hidden="true" className="size-4" />Download QR</a>
        <p className="text-sm text-muted-foreground">Save the image on your phone or print it on your member card. Keep it private; it identifies your attendance record.</p>
      </div> : <div role="status" className="rounded-md bg-muted p-5"><h3 className="font-semibold">{active ? "Your QR needs reception’s help" : "Your attendance QR is unavailable"}</h3><p className="mt-2 text-sm leading-relaxed">{active ? "Ask reception to issue your personal QR. Refresh this page once it is ready." : "See reception to review or renew your membership. A member login does not grant gym access."}</p></div>}
      {data.periodText && <p className="border-t border-border pt-5 text-sm leading-relaxed text-muted-foreground">Membership period: {data.periodText}</p>}
    </CardContent></Card>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Checked {data.checkedText}</p><Button variant="outline" disabled={refreshing} onClick={() => startTransition(() => router.refresh())}><RefreshCw aria-hidden="true" className="size-4" />{refreshing ? "Refreshing…" : "Refresh membership"}</Button></div>
    <p className="text-sm text-muted-foreground">Local synthetic demonstration. Do not use real member details.</p>
  </div>;
}
