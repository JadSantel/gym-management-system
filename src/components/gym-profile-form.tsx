"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Mail, Phone, Clock3, MapPin, Globe2, Coins, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IdentityFeedback, type IdentityFeedbackState } from "@/components/identity-feedback";
import { gymProfileSchema, gymProfileErrors, type GymProfile } from "@/lib/gym-profile-schema";

const fields = [
  { key: "name", label: "Gym name", icon: Building2, max: 120, autoComplete: "organization" },
  { key: "contactEmail", label: "Email address", icon: Mail, max: 254, autoComplete: "email", type: "email" },
  { key: "phone", label: "Phone number", icon: Phone, max: 30, autoComplete: "tel", type: "tel" },
  { key: "profileTimezone", label: "Timezone", icon: Clock3, max: 100 },
  { key: "address", label: "Address", icon: MapPin, max: 500, autoComplete: "street-address" },
  { key: "profileCountry", label: "Country", icon: Globe2, max: 80, autoComplete: "country-name" },
  { key: "profileCurrency", label: "Currency", icon: Coins, max: 3 },
] as const;

export function GymProfileForm({ initial, owner }: { initial: GymProfile; owner: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<IdentityFeedbackState>({ message: "", error: false });
  const editButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const router = useRouter();
  useEffect(() => {
    if (editing) { document.getElementById("gym-name")?.focus(); return; }
    if (!returnFocus.current) return;
    // Refresh updates the shell's gym name and may restore its own focus.
    // Repeat the return after the saved profile version arrives from the server.
    const frame = requestAnimationFrame(() => editButton.current?.focus());
    if (initial.profileVersion === saved.profileVersion) returnFocus.current = false;
    return () => cancelAnimationFrame(frame);
  }, [editing, initial.profileVersion, saved.profileVersion]);
  const links = Object.entries(errors).filter(([key]) => fields.some(field => field.key === key)).map(([key, label]) => ({ id: `gym-${key}`, label }));
  function finish() { returnFocus.current = true; setEditing(false); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setErrors({}); setFeedback({ message: "", error: false });
    const parsed = gymProfileSchema.safeParse(values);
    if (!parsed.success) { setErrors(gymProfileErrors(parsed.error)); setFeedback({ message: "Review the highlighted fields.", error: true }); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/settings/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json();
      if (!response.ok) { setErrors(result.fieldErrors ?? {}); setFeedback({ message: result.error ?? "Unable to save gym profile. Try again.", error: true }); return; }
      const next = { ...parsed.data, profileVersion: result.profileVersion };
      setSaved(next); setValues(next); setFeedback({ message: "Gym profile saved.", error: false }); finish(); router.refresh();
    } catch { setFeedback({ message: "Unable to confirm the save. Reload the page to check current details before trying again.", error: true }); }
    finally { setBusy(false); }
  }
  return <section aria-labelledby="gym-profile-title" className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="gym-profile-title" className="text-xl font-semibold">Gym profile</h2><p className="mt-1 text-sm text-muted-foreground">Your gym’s name and contact information.</p></div>
      {owner && !editing && <Button ref={editButton} variant="outline" onClick={() => { setEditing(true); setFeedback({ message: "", error: false }); }}><Pencil aria-hidden="true" className="size-4" />Edit profile</Button>}
    </div>
    <div className="flex min-w-0 items-center gap-4 rounded-xl border border-border bg-card p-5 sm:p-6"><span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-brand-surface text-2xl font-semibold text-brand-foreground">{saved.name.slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="break-words text-lg font-semibold">{saved.name}</p><p className="mt-1 break-all text-sm text-muted-foreground">{saved.contactEmail || "No contact email recorded"}</p></div></div>
    {!owner && <p className="text-sm text-muted-foreground">Only the gym owner can edit this profile.</p>}
    <IdentityFeedback id="gym-profile-feedback" feedback={feedback} links={links} />
    <p id="profile-label-help" className="text-sm leading-relaxed text-muted-foreground">Timezone, country, and currency are profile labels. Payments and receipts use PHP; membership dates and the operational clock use Asia/Manila.</p>
    {editing ? <>
      <form noValidate onSubmit={save} aria-label="Edit gym profile" aria-busy={busy} className="space-y-6">
        <fieldset disabled={busy} className="grid min-w-0 gap-5 sm:grid-cols-2"><legend className="sr-only">Gym information</legend>
          {fields.map(field => <label key={field.key} htmlFor={`gym-${field.key}`} className={`min-w-0 space-y-2 text-sm font-medium ${field.key === "address" ? "sm:col-span-2" : ""}`}>
            <span className="flex items-center gap-2"><field.icon aria-hidden="true" className="size-4 text-muted-foreground" />{field.label}</span>
            {field.key === "profileCurrency" ? <select id={`gym-${field.key}`} value={values.profileCurrency} onChange={event => setValues(previous => ({ ...previous, profileCurrency: event.target.value }))} aria-invalid={!!errors[field.key]} aria-describedby={`profile-label-help${errors[field.key] ? ` gym-${field.key}-error` : ""}`} className="min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{Intl.supportedValuesOf("currency").map(code => <option key={code} value={code}>{code} — {new Intl.DisplayNames(["en"], { type: "currency" }).of(code)}</option>)}</select>
              : <Input id={`gym-${field.key}`} name={field.key} value={values[field.key]} maxLength={field.max} type={"type" in field ? field.type : "text"} autoComplete={"autoComplete" in field ? field.autoComplete : "off"} list={field.key === "profileTimezone" ? "gym-timezones" : undefined} aria-invalid={!!errors[field.key]} aria-describedby={`${field.key === "contactEmail" ? "gym-email-help" : field.key.startsWith("profile") ? "profile-label-help" : ""}${errors[field.key] ? ` gym-${field.key}-error` : ""}`.trim() || undefined} onChange={event => setValues(previous => ({ ...previous, [field.key]: event.target.value }))} />}
            {field.key === "contactEmail" && <span id="gym-email-help" className="block text-xs font-normal text-muted-foreground">Gym contact email. Your verified login email stays separate.</span>}
            {errors[field.key] && <span id={`gym-${field.key}-error`} className="block text-sm font-normal text-destructive">{errors[field.key]}</span>}
          </label>)}
        </fieldset>
        <datalist id="gym-timezones">{["UTC", ...Intl.supportedValuesOf("timeZone")].map(zone => <option key={zone} value={zone} />)}</datalist>
        <div className="flex flex-wrap gap-3 border-t border-border pt-5"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setValues(saved); setErrors({}); setFeedback({ message: "", error: false }); finish(); }}>Cancel</Button></div>
      </form>
    </> : <dl className="grid min-w-0 gap-4 sm:grid-cols-2">{fields.map(({ key, label, icon: Icon }) => <div key={key} className={`min-w-0 rounded-xl border border-border bg-card p-5 ${key === "address" ? "sm:col-span-2" : ""}`}><dt className="flex items-center gap-3 text-xs text-muted-foreground"><Icon aria-hidden="true" className="size-4 shrink-0" />{label}</dt><dd className="mt-1 ml-7 break-words text-sm font-medium">{saved[key] || "Not recorded"}</dd></div>)}</dl>}
  </section>;
}
