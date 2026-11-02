import { Input } from "./ui/input";
import type { MemberFieldErrors } from "@/lib/member-schema";
export function ContactFields({ prefix, errors = {}, disabled, required, email, phone }: {
  prefix: string; errors?: MemberFieldErrors; disabled?: boolean; required?: boolean; email?: string | null; phone?: string | null;
}) {
  return <div className="grid min-w-0 gap-4 sm:grid-cols-2">
    <div className="min-w-0"><label htmlFor={`${prefix}-email`}>Email{!required && " (optional)"}</label>
      <Input id={`${prefix}-email`} name="email" type="email" autoComplete="email" maxLength={254} required={required} disabled={disabled} defaultValue={email ?? ""}
        aria-invalid={!!errors.email} aria-describedby={errors.email ? `${prefix}-email-error` : `${prefix}-contact-note`} />
      {errors.email && <p id={`${prefix}-email-error`} className="mt-1 text-sm text-destructive">{errors.email}</p>}</div>
    <div className="min-w-0"><label htmlFor={`${prefix}-phone`}>Philippine mobile{!required && " (optional)"}</label>
      <Input id={`${prefix}-phone`} name="phone" type="tel" autoComplete="tel" maxLength={32} required={required} disabled={disabled} defaultValue={phone ?? ""}
        aria-invalid={!!errors.phone} aria-describedby={`${prefix}-phone-help${errors.phone ? ` ${prefix}-phone-error` : ""} ${prefix}-contact-note`} />
      <p id={`${prefix}-phone-help`} className="mt-1 text-sm text-muted-foreground">Use 09 followed by 9 digits, or its +639 equivalent.</p>
      {errors.phone && <p id={`${prefix}-phone-error`} className="mt-1 text-sm text-destructive">{errors.phone}</p>}</div>
    <p id={`${prefix}-contact-note`} className="text-sm text-muted-foreground sm:col-span-2">Recorded contacts are unverified. No email or text message is sent.</p>
  </div>;
}
