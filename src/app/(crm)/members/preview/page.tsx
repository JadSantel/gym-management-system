import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getActor, IdentityError } from "@/lib/identity";
import { authorize } from "@/lib/tenant";
import { MembersPreview } from "@/components/members-preview";

export const dynamic = "force-dynamic";

export default async function MembersPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  try {
    const actor = await getActor(await headers());
    authorize(actor.operator, "MEMBERS");
  } catch (error) {
    if (error instanceof IdentityError) redirect(error.status === 401 ? "/" : "/team");
    throw error;
  }
  return <MembersPreview />;
}
