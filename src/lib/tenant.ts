import type { Prisma } from "../generated/prisma/client";
import { db } from "./db";
import { setGymContext } from "./binding";
import { getActor, IdentityError } from "./identity";

export type Capability = "MEMBERS" | "CASH" | "OWNER";
export function authorize(operator: { role: string; canManageMembers: boolean; canCollectCash: boolean }, capability: Capability) {
  if (operator.role === "OWNER") return;
  if (capability === "MEMBERS" && operator.canManageMembers) return;
  if (capability === "CASH" && operator.canCollectCash) return;
  throw new IdentityError(403, "Your account does not have permission for this action.");
}

export async function inGym<T>(headers: Headers, capability: Capability, work: (tx: Prisma.TransactionClient, actor: Awaited<ReturnType<typeof getActor>>) => Promise<T>) {
  const actor = await getActor(headers);
  return db.$transaction(async tx => {
    await setGymContext(tx, actor.operator.gymId);
    // Offboarding/capability administration locks this gym FOR UPDATE. Recheck after acquiring the shared lock.
    await tx.$queryRaw`SELECT id FROM gyms WHERE id = ${actor.operator.gymId}::uuid FOR SHARE`;
    const current = await tx.operator.findUnique({ where: { id: actor.operator.id }, include: { gym: true, user: true } });
    const session = await tx.session.findUnique({ where: { id: actor.sessionId } });
    if (!current || current.state !== "ACTIVE" || current.gym.state !== "ACTIVE" || !current.user.emailVerified
        || !session || session.userId !== current.userId || session.expiresAt.getTime() <= Date.now()) throw new IdentityError(403, "Account access is unavailable.");
    authorize(current, capability);
    return work(tx, { ...actor, operator: current });
  });
}
