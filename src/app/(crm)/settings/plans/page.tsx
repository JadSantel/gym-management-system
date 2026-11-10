import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActor, IdentityError } from "@/lib/identity";
import { listPlans } from "@/lib/plans";
import { PlanSettings } from "@/components/plan-settings";

export default async function PlansPage() {
  const requestHeaders = await headers();
  const actor = await getActor(requestHeaders).catch(error => { if (error instanceof IdentityError) redirect("/login"); throw error; });
  if (actor.operator.role !== "OWNER") redirect("/settings");
  const plans = await listPlans(requestHeaders);
  return <section aria-labelledby="settings-plans-title"><h2 id="settings-plans-title" className="text-xl font-semibold">Plans and Pricing</h2><p className="mt-1 mb-6 text-sm text-muted-foreground">Choose the full price for your approved plans. Plan durations stay fixed.</p><PlanSettings initial={plans.map(({ id, name, durationDays, priceCentavos, version }) => ({ id, name, durationDays, priceCentavos, version }))} /></section>;
}
