"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export function SignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div><Button variant="outline" disabled={busy} onClick={async () => {
    setBusy(true); setError("");
    try { const response = await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error(); router.replace("/login?signedOut=true"); router.refresh();
    } catch { setError("Unable to sign out. Try again."); setBusy(false); }
  }}>{busy ? "Signing out…" : "Sign out"}</Button><p role="status" className="text-sm text-destructive">{error}</p></div>;
}
