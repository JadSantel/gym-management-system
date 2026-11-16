"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

export function PlatformLoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
      if (!response.ok) throw new Error("Unable to sign in. Check your credentials or contact your platform administrator.");
      router.replace("/platform/onboarding"); router.refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to connect. Try again.");
    } finally {
      const password = formElement.querySelector<HTMLInputElement>('input[name="password"]');
      if (password) password.value = "";
      setBusy(false);
    }
  }
  return <Card className="w-full max-w-md border-0 shadow-none ring-0">
    <CardHeader className="px-0"><h1 className="text-2xl font-semibold tracking-tight">Platform sign in</h1><CardDescription>Private access for designated platform administrators.</CardDescription></CardHeader>
    <CardContent className="px-0"><form onSubmit={submit} aria-busy={busy}><FieldGroup>
      {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <Field><FieldLabel htmlFor="platform-email">Email</FieldLabel><Input id="platform-email" name="email" type="email" autoComplete="username" autoCapitalize="none" required maxLength={254} disabled={busy} /></Field>
      <Field><FieldLabel htmlFor="platform-password">Password</FieldLabel><Input id="platform-password" name="password" type="password" autoComplete="current-password" required maxLength={128} disabled={busy} /></Field>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : "Sign in"}</Button>
    </FieldGroup></form></CardContent>
  </Card>;
}
