import { inGym, authorize } from "./tenant";
import { IdentityError } from "./identity";

export function proposedPeriod(now: Date, durationDays: number) {
  if (![30, 90, 180].includes(durationDays)) throw new IdentityError(400, "Unsupported membership duration.");
  const manilaDate = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  const start = new Date(`${manilaDate}T00:00:00+08:00`);
  return { intendedStart: start, intendedEnd: new Date(start.getTime() + durationDays * 86400_000) };
}
export async function prepareCharge(headers: Headers, memberId: string, planId: string) {
  return inGym(headers, "MEMBERS", async (tx, actor) => {
    authorize(actor.operator, "CASH");
    const member = await tx.member.findUnique({ where: { id: memberId } });
    const plan = await tx.plan.findUnique({ where: { id: planId } });
    if (!member || !plan) throw new IdentityError(404, "Member or approved plan unavailable.");
    const charge = await tx.charge.create({ data: {
      gymId: actor.operator.gymId, memberId: member.id, planId: plan.id, planName: plan.name,
      durationDays: plan.durationDays, priceCentavos: plan.priceCentavos, planVersion: plan.version,
      preparedBy: actor.operator.id, ...proposedPeriod(new Date(), plan.durationDays),
    } });
    await tx.identityAudit.create({ data: { gymId: actor.operator.gymId, initiatorId: actor.operator.userId, subjectId: charge.id, action: "CHARGE_PREVIEW_PREPARED" } });
    return charge;
  });
}
export async function readCharge(headers: Headers, id: string) {
  return inGym(headers, "MEMBERS", tx => tx.charge.findUnique({ where: { id }, include: {
    member: { select: { fullName: true } }, plan: { select: { version: true } },
    preparer: { select: { user: { select: { name: true } } } },
  } }));
}
