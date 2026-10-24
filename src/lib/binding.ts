import type { Prisma } from "../generated/prisma/client";
import { db } from "./db";

export type IdentityBinding = {
  id: string; userId: string; gymId: string; role: "OWNER" | "STAFF"; state: "PENDING" | "ACTIVE" | "DISABLED";
  canManageMembers: boolean; canCollectCash: boolean;
  gym: { id: string; name: string; state: "PENDING" | "ACTIVE" | "DISABLED" };
  user: { id: string; name: string; email: string; emailVerified: boolean; username: string | null };
};
export async function identityBinding(userId: string) {
  const [result] = await db.$queryRaw<{ binding: IdentityBinding | null }[]>`SELECT public.identity_binding(${userId}) AS binding`;
  return result.binding;
}
export async function setGymContext(tx: Prisma.TransactionClient, gymId: string) {
  await tx.$queryRaw`SELECT set_config('app.current_gym_id', ${gymId}, true)`;
}
