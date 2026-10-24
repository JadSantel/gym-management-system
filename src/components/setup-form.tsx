"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { identityRequest } from "@/lib/client";
export function SetupForm() {
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const changed = () => { if (window.location.hash) { setComplete(false); setMessage(""); } };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirmation")) { setMessage("Passwords must match."); setBusy(false); return; }
    try {
      await identityRequest("setup", { token: window.location.hash.slice(1), password: form.get("password") });
      window.history.replaceState(null, "", "/setup");
      setComplete(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to connect. Try again."); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-md"><p className="mb-2 text-sm font-semibold text-primary">Private account setup</p>
    <h1 className="mb-3 text-3xl font-semibold tracking-tight">{complete ? "Your password is ready" : "Choose your password"}</h1>
    {complete ? <p>Setup is complete. <Link href="/login" className="underline">Sign in to continue</Link>.</p> : <>
      <p className="mb-8 text-muted-foreground">Use the invitation or recovery link sent to your email. Keep your password private.</p>
      <form onSubmit={submit} className="space-y-5 rounded-xl border border-border bg-card p-6" aria-busy={busy}>
        <label htmlFor="password">New password<Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} aria-describedby="password-help" required disabled={busy} /></label>
        <p id="password-help" className="text-sm text-muted-foreground">Use 12–128 characters. Password managers and paste are supported.</p>
        <label htmlFor="confirmation">Confirm password<Input id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} /></label>
        <p role="status" className="text-sm text-destructive">{message}</p>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Save private password"}</Button>
        <Link href="/login" className="block text-sm underline">Back to sign in</Link>
      </form></>}
  </div>;
}
