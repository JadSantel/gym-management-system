import { registrationScope } from "@/lib/registration";
import { IdentityError } from "@/lib/identity";
import { RegistrationForm } from "@/components/registration-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Member registration", description: "Register your gym member profile, then visit the front desk to activate your membership.", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const scope = await registrationScope(code).catch(error => { if (error instanceof IdentityError) return null; throw error; });
  return <div className="mx-auto w-full max-w-xl space-y-7 px-1">
    <div><h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{scope ? `Join ${scope.name}` : "Registration unavailable"}</h1><p className="mt-3 text-muted-foreground">{scope ? "Save your details, then finish your membership at reception." : "This link has expired or is unavailable. Ask reception for the current registration link."}</p></div>
    <section className="panel">{scope ? <RegistrationForm code={code} /> : <p>Reception can help you create or find your member profile.</p>}</section>
    <p className="text-sm text-muted-foreground">Local synthetic demonstration. Use synthetic details only.</p>
  </div>;
}
