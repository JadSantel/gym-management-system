import { db } from "./db";
import { inGym } from "./tenant";
import { getActor, IdentityError, ownerInTransaction } from "./identity";
import { parsePesos } from "./money";
import type { PlanChange } from "./finance-schema";

// O-07 user approval, 2026-10-24. No extra plans or discount variants.
const approved = [
  { name: "Monthly", durationDays: 30, priceCentavos: 80_000 },
  { name: "3 Months", durationDays: 90, priceCentavos: 210_000 },
  { name: "6 Months", durationDays: 180, priceCentavos: 400_000 },
] as const;

export async function listPlans(headers: Headers) {
  return inGym(headers, "MEMBERS", tx => tx.plan.findMany({ orderBy: { durationDays: "asc" } }));
}
export async function changePlans(headers: Headers, input: PlanChange) {
  const actor = await getActor(headers);
  const price = input.action === "update" ? parsePesos(input.price) : null;
  if (input.action === "update" && price === null) throw new IdentityError(400, "Enter a positive PHP price with no more than two decimal places (maximum ₱21,474,836.47).");
  return db.$transaction(async tx => {
    const owner = await ownerInTransaction(tx, actor);
    if (input.action === "initialize") {
      const created = await tx.plan.createMany({ data: approved.map(plan => ({ ...plan, gymId: owner.gymId, createdBy: owner.id })), skipDuplicates: true });
      if (created.count) await tx.identityAudit.create({ data: { gymId: owner.gymId, initiatorId: owner.userId, subjectId: owner.gymId, action: "APPROVED_CATALOGUE_INITIALIZED" } });
    } else {
      const changed = await tx.plan.updateMany({ where: { id: input.planId, version: input.version }, data: { priceCentavos: price!, version: { increment: 1 } } });
      if (!changed.count) throw new IdentityError(409, "Plan unavailable or changed since you opened it. Reload and review the current price.");
      await tx.identityAudit.create({ data: { gymId: owner.gymId, initiatorId: owner.userId, subjectId: input.planId, action: `PLAN_PRICE_CHANGED_${price}_CENTAVOS` } });
    }
    return tx.plan.findMany({ orderBy: { durationDays: "asc" } });
  });
}
