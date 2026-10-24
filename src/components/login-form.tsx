"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { identityRequest } from "@/lib/client";

export function LoginForm({ signedOut = false }: { signedOut?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(signedOut ? "You are signed out." : "");
  const [recovery, setRecovery] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      if (recovery) {
        const result = await identityRequest("reset-owner", { email: form.get("identifier") });
        setMessage(result.status);
      } else {
        const response = await fetch(`/api/auth/sign-in/${mode}`, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ [mode]: form.get("identifier"), password: form.get("password") }) });
        if (!response.ok) throw new Error(response.status === 429 ? "Too many attempts. Wait one minute and try again." : "Unable to sign in. Check your credentials or contact your owner.");
        router.replace("/"); router.refresh();
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to connect. Try again."); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-md">
    <p className="mb-2 text-sm font-semibold text-primary">Operator access</p><h1 className="mb-3 text-3xl font-semibold tracking-tight">{recovery ? "Recover owner access" : "Sign in to your gym"}</h1>
    <p className="mb-8 text-muted-foreground">{recovery ? "Use the verified email attached to your owner account." : "Use your individual account. Your access belongs to one gym."}</p>
    <form onSubmit={submit} className="space-y-5 rounded-xl border border-border bg-card p-6" aria-busy={busy}>
      {!recovery && <fieldset disabled={busy}><legend className="mb-2 text-sm font-semibold">Account type</legend><div className="grid grid-cols-2 gap-3">
        {[["email", "Owner"], ["username", "Staff"]].map(([value, label]) => <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 ${mode === value ? "border-primary bg-muted" : "border-border"}`}><input type="radio" name="mode" value={value} checked={mode === value} onChange={() => { setMode(value); setMessage(""); }} />{label}</label>)}
      </div></fieldset>}
      <label htmlFor="identifier">{mode === "email" || recovery ? "Email" : "Username"}<Input key={mode} id="identifier" name="identifier" type={mode === "email" || recovery ? "email" : "text"} autoComplete="username" autoCapitalize="none" required maxLength={254} disabled={busy} /></label>
      {!recovery && <label htmlFor="password">Password<Input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} disabled={busy} /></label>}
      <p id="login-result" role="status" className="text-sm text-muted-foreground">{message}</p>
      <Button type="submit" disabled={busy} className="w-full">{busy ? "Please wait…" : recovery ? "Request recovery link" : "Sign in"}</Button>
      {mode === "email" && <Button variant="outline" disabled={busy} className="w-full" onClick={() => { setRecovery(!recovery); setMessage(""); }}>{recovery ? "Back to sign in" : "Forgot your password?"}</Button>}
      {mode === "username" && <p className="text-sm text-muted-foreground">For password recovery, ask your gym owner to send a reset link.</p>}
    </form>
    <p className="mt-5 text-sm text-muted-foreground">Accounts are invitation only. Ask your owner or platform contact if you need access.</p>
  </div>;
}
