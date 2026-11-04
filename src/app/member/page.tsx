import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { memberDashboard } from "@/lib/member-access";
import { IdentityError } from "@/lib/identity";
import { MemberDashboard } from "@/components/member-dashboard";
export const dynamic = "force-dynamic";
export const metadata = { title: "My Gym QR" };
export default async function MemberPage() {
  const data = await memberDashboard(await headers()).catch(error => { if (error instanceof IdentityError) redirect("/member/login"); throw error; });
  return <MemberDashboard key={data.checkedAt} data={data} />;
}
