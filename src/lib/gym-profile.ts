import "server-only";
import { db } from "./db";
import { getActor, IdentityError, ownerInTransaction } from "./identity";
import { gymProfileSchema, gymProfileErrors } from "./gym-profile-schema";
import { setGymContext } from "./binding";

export async function readGymProfile(headers: Headers) {
  const actor = await getActor(headers);
  return db.$transaction(async tx => {
    await setGymContext(tx, actor.operator.gymId);
    return tx.gym.findUniqueOrThrow({ where: { id: actor.operator.gymId, state: "ACTIVE" } });
  });
}

export async function updateGymProfile(headers: Headers, input: unknown) {
  const actor = await getActor(headers);
  const parsed = gymProfileSchema.safeParse(input);
  if (!parsed.success) throw new IdentityError(400, "Review the gym profile fields.", gymProfileErrors(parsed.error));
  return db.$transaction(async tx => {
    const owner = await ownerInTransaction(tx, actor, false);
    const { profileVersion, ...data } = parsed.data;
    const changed = await tx.gym.updateMany({
      where: { id: owner.gymId, profileVersion },
      data: { ...data, contactEmail: data.contactEmail || null, phone: data.phone || null, address: data.address || null, profileVersion: { increment: 1 } },
    });
    if (!changed.count) throw new IdentityError(409, "Gym profile changed since you opened it. Reload the page and review the current details before saving.");
    await tx.identityAudit.create({ data: { gymId: owner.gymId, initiatorId: owner.userId, subjectId: owner.gymId, action: "GYM_PROFILE_UPDATED" } });
    return { profileVersion: profileVersion + 1 };
  });
}
