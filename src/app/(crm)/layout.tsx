import { headers } from "next/headers";
import { getActor, IdentityError } from "@/lib/identity";
import { AppShell } from "@/components/app-shell";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor(await headers()).catch(error => { if (error instanceof IdentityError) return null; throw error; });
  return <AppShell actor={actor ? { name: actor.operator.user.name, gym: actor.operator.gym.name, owner: actor.operator.role === "OWNER", members: actor.operator.canManageMembers, cash: actor.operator.canCollectCash } : null}>{children}</AppShell>;
}
