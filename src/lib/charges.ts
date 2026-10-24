import { createHash, randomUUID } from "node:crypto";
import { inGym, authorize } from "./tenant";
import { IdentityError } from "./identity";
import { parsePesos } from "./money";
import type { Prisma } from "../generated/prisma/client";

// Only use after the same-key operation has been serialized/read and before financial writes.
export class CashConfirmationRejected extends IdentityError {}

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

export async function confirmCash(headers: Headers, chargeId: string, received: string, operationKey: string) {
  const amount = parsePesos(received);
  if (amount === null) throw new IdentityError(400, "Enter the full cash amount in PHP, with no more than two decimal places.");
  const fingerprint = createHash("sha256").update(`${chargeId}:${amount}`).digest("hex");
  return inGym(headers, "CASH", async (tx, actor) => {
    const gymId = actor.operator.gymId;
    await tx.$queryRaw`INSERT INTO idempotency_operations (id, gym_id, operation_type, operation_key, request_fingerprint)
      VALUES (${randomUUID()}::uuid, ${gymId}::uuid, 'CASH_CONFIRMATION', ${operationKey}, ${fingerprint})
      ON CONFLICT (gym_id, operation_type, operation_key) DO NOTHING`;
    const operation = await tx.idempotencyOperation.findUniqueOrThrow({ where: { gymId_operationType_operationKey: { gymId, operationType: "CASH_CONFIRMATION", operationKey } } });
    if (operation.requestFingerprint !== fingerprint) throw new IdentityError(409, "This confirmation key was already used for different payment details.");
    if (operation.paymentId) return readPayment(tx, operation.paymentId);
    if (operation.completedAt) throw new IdentityError(409, "This confirmation is incomplete. Retry with the same key.");

    const charge = await tx.charge.findUnique({ where: { id: chargeId } });
    if (!charge) throw new CashConfirmationRejected(404, "Charge preview unavailable.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${gymId}:${charge.memberId}`}, 0))`;
    await tx.$queryRaw`SELECT id FROM plans WHERE id = ${charge.planId}::uuid AND gym_id = ${gymId}::uuid FOR SHARE`;
    const currentPlan = await tx.plan.findUnique({ where: { id: charge.planId } });
    if (!currentPlan || currentPlan.version !== charge.planVersion || currentPlan.priceCentavos !== charge.priceCentavos || currentPlan.durationDays !== charge.durationDays) {
      throw new CashConfirmationRejected(409, "The approved price changed. Prepare and review a new charge before collecting cash.");
    }
    if (amount !== charge.priceCentavos) throw new CashConfirmationRejected(400, "The full approved amount must be received before confirming membership. No payment was recorded.");

    const now = new Date();
    const intervals = await tx.effectiveEntitlement.findMany({ where: { memberId: charge.memberId, isCurrentProjection: true }, orderBy: { startsAt: "asc" } });
    const future = intervals.find(interval => interval.startsAt.getTime() > now.getTime());
    if (future) throw new CashConfirmationRejected(409, "A future paid period already exists. Another advance renewal is not available.");
    const latest = intervals.at(-1);
    const startsAt = latest && latest.endsAt.getTime() > now.getTime()
      ? latest.endsAt
      : proposedPeriod(now, charge.durationDays).intendedStart;
    const endsAt = new Date(startsAt.getTime() + charge.durationDays * 86_400_000);
    const id = randomUUID();
    const reference = `CASH-${randomUUID().toUpperCase()}`;
    const payment = await tx.payment.create({ data: {
      id, gymId, memberId: charge.memberId, chargeId, reference, amountCentavos: amount,
      collectedBy: actor.operator.id, collectedAt: now, verifiedBy: actor.operator.id, verifiedAt: now,
    } });
    const period = await tx.membershipPeriod.create({ data: { gymId, memberId: charge.memberId, paymentId: id, confirmedBy: actor.operator.id, startsAt, endsAt } });
    await tx.effectiveEntitlement.create({ data: { gymId, memberId: charge.memberId, periodId: period.id, startsAt, endsAt } });
    const receipt = await tx.paymentReceipt.create({ data: { gymId, paymentId: id, reference: `RECEIPT-${randomUUID().toUpperCase()}` } });
    await tx.identityAudit.create({ data: { gymId, initiatorId: actor.operator.userId, subjectId: id, action: "CASH_PAYMENT_CONFIRMED" } });
    await tx.idempotencyOperation.update({ where: { id: operation.id }, data: { paymentId: id, completedAt: now } });
    return { payment, period, receipt };
  });
}

async function readPayment(tx: Prisma.TransactionClient, id: string) {
  const payment = await tx.payment.findUnique({ where: { id }, include: { period: true, receipt: true } });
  if (!payment?.period || !payment.receipt) throw new IdentityError(409, "This confirmation is incomplete. Retry with the same key.");
  return { payment, period: payment.period, receipt: payment.receipt };
}
