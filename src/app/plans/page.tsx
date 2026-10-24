import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getActor, IdentityError } from "@/lib/identity";
import { listPlans } from "@/lib/plans";
import { PlanSettings } from "@/components/plan-settings";
export const dynamic = "force-dynamic";
export default async function PlansPage() {
  const requestHeaders = await headers();
  const actor = await getActor(requestHeaders).catch(error => { if (error instanceof IdentityError) redirect("/login"); throw error; });
  if (actor.operator.role !== "OWNER") redirect("/");
  const plans = await listPlans(requestHeaders);
  return <><Link href="/" className="text-sm underline">Back to overview</Link><h1 className="mt-5 text-3xl font-semibold tracking-tight">Plans and pricing</h1>
    <p className="mt-3 text-muted-foreground">Choose the full price for your approved plans. Plan durations stay fixed.</p>
    <PlanSettings initial={plans.map(({ id, name, durationDays, priceCentavos, version }) => ({ id, name, durationDays, priceCentavos, version }))} />
  </>;
}
