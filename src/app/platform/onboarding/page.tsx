import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ThemeControl } from "@/components/theme-control";
import { PlatformOnboardingQueue } from "@/components/platform-onboarding-queue";
import { getPlatformAdmin } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function PlatformOnboardingPage() {
  const admin = await getPlatformAdmin(await headers()).catch(() => null);
  if (!admin) redirect("/platform/login");
  return <main id="main" className="min-h-svh bg-background"><header className="flex h-14 items-center justify-end border-b px-3"><ThemeControl /></header><PlatformOnboardingQueue adminName={admin.name} /></main>;
}
