import { createHash, randomUUID } from "node:crypto";
import { db } from "./db";
import { inGym, authorize } from "./tenant";
import { getActor, ownerInTransaction, IdentityError } from "./identity";
import { proposedPeriod, readPayment } from "./charges";
import { parsePesos } from "./money";
import { digitalCommandSchema, digitalOperationKeySchema, type DigitalCommand } from "./digital-schema";

export class DigitalConfirmationRejected extends IdentityError {}
export const manilaDate = (date: Date) => new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

export async function digitalOverview(headers: Headers) {
  return inGym(headers, "MEMBERS", async (tx, actor) => {
    const accounts = await tx.receivingAccount.findMany({ orderBy: { label: "asc" } });
    const verifiers = await tx.digitalVerifier.findMany();
    const operators = await tx.operator.findMany({ where: { state: "ACTIVE" }, select: { id: true, role: true, user: { select: { name: true } } } });
    const claims = await tx.digitalClaim.findMany({ orderBy: { enteredAt: "desc" } });
    const settlements = await tx.digitalSettlement.findMany();
    const receipts = await tx.paymentReceipt.findMany({ where: { paymentId: { in: settlements.map(row => row.paymentId) } } });
    const flags = await tx.paymentFlag.findMany({ orderBy: { createdAt: "desc" } });
    const charges = await tx.charge.findMany({ where: { id: { in: claims.map(claim => claim.chargeId) } }, include: { member: { select: { id: true, fullName: true } } } });
    return { accounts, verifiers, operators, claims, settlements, flags, charges, receipts, operatorId: actor.operator.id,
      owner: actor.operator.role === "OWNER", recoveryScope: `${actor.operator.gymId}:${actor.operator.id}` };
  });
}

export async function digitalCommand(headers: Headers, input: DigitalCommand, operationKey?: string) {
  const parsed = digitalCommandSchema.safeParse(input);
  if (!parsed.success) throw new IdentityError(400, "Check the digital payment fields.");
  const command = parsed.data;
  if (command.action === "account" || command.action === "verifier") {
    const actor = await getActor(headers);
    return db.$transaction(async tx => {
      const owner = await ownerInTransaction(tx, actor);
      if (command.action === "account") {
        const account = await tx.receivingAccount.create({ data: { gymId: owner.gymId, label: command.label, method: command.method, createdBy: owner.id } });
        await tx.identityAudit.create({ data: { gymId: owner.gymId, initiatorId: owner.userId, subjectId: account.id, action: "DIGITAL_ACCOUNT_DESIGNATED" } });
        return account;
      }
      const account = await tx.receivingAccount.findUnique({ where: { id: command.accountId } });
      const operator = await tx.operator.findUnique({ where: { id: command.operatorId } });
      if (!account || !operator || operator.state !== "ACTIVE") throw new IdentityError(404, "Account or active operator unavailable.");
      const verifier = await tx.digitalVerifier.upsert({ where: { accountId_operatorId: { accountId: account.id, operatorId: operator.id } },
        create: { gymId: owner.gymId, accountId: account.id, operatorId: operator.id, active: command.active }, update: { active: command.active } });
      await tx.identityAudit.create({ data: { gymId: owner.gymId, initiatorId: owner.userId, subjectId: verifier.id, action: command.active ? "DIGITAL_VERIFIER_GRANTED" : "DIGITAL_VERIFIER_REVOKED" } });
      return verifier;
    });
  }
  return inGym(headers, "MEMBERS", async (tx, actor) => {
    const gymId = actor.operator.gymId;
    if (command.action === "claim") {
      authorize(actor.operator, "CASH");
      const charge = await tx.charge.findUnique({ where: { id: command.chargeId } });
      const account = await tx.receivingAccount.findUnique({ where: { id: command.accountId } });
      if (!charge || !account) throw new IdentityError(404, "Charge or receiving account unavailable.");
      if (new Date(command.reportedReceivedAt).getTime() > Date.now()) throw new IdentityError(400, "A reported transfer cannot be in the future.");
      // The immutable charge is the claim's retry identity; only an exact replay is accepted.
      await tx.$queryRaw`SELECT id FROM members WHERE id = ${charge.memberId}::uuid AND gym_id = ${gymId}::uuid FOR UPDATE`;
      const existing = await tx.digitalClaim.findUnique({ where: { chargeId: charge.id } });
      if (existing) {
        if (existing.accountId !== command.accountId || existing.amountCentavos !== parsePesos(command.amount)
          || existing.transactionReference !== command.transactionReference || existing.reportedReceivedAt.getTime() !== new Date(command.reportedReceivedAt).getTime()) {
          throw new IdentityError(409, "This charge already has a different transfer claim. Preserve it for owner review.");
        }
        return existing;
      }
      if (await tx.payment.findUnique({ where: { chargeId: charge.id } })) throw new IdentityError(409, "This charge already has a confirmed payment.");
      const claim = await tx.digitalClaim.create({ data: { gymId, chargeId: charge.id, accountId: account.id,
        amountCentavos: parsePesos(command.amount)!, transactionReference: command.transactionReference,
        reportedReceivedAt: new Date(command.reportedReceivedAt), collectedBy: actor.operator.id } });
      await tx.identityAudit.create({ data: { gymId, initiatorId: actor.operator.userId, subjectId: claim.id, action: "DIGITAL_CLAIM_RECORDED_PENDING" } });
      return claim;
    }
    if (command.action === "flag") {
      const payment = await tx.payment.findUnique({ where: { id: command.paymentId } });
      if (!payment || payment.method === "CASH") throw new IdentityError(404, "Confirmed digital payment unavailable.");
      const flag = await tx.paymentFlag.upsert({ where: { paymentId_reason: { paymentId: payment.id, reason: command.reason } },
        create: { gymId, paymentId: payment.id, reason: command.reason, reportedBy: actor.operator.id }, update: {} });
      await tx.identityAudit.create({ data: { gymId, initiatorId: actor.operator.userId, subjectId: flag.id, action: "DIGITAL_PAYMENT_FLAGGED_OWNER_REVIEW" } });
      return flag;
    }
    const claim = await tx.digitalClaim.findUnique({ where: { id: command.claimId } });
    if (!claim) throw new IdentityError(404, "Transfer claim unavailable.");
    const grant = await tx.digitalVerifier.findUnique({ where: { accountId_operatorId: { accountId: claim.accountId, operatorId: actor.operator.id } } });
    if (!grant?.active) throw new IdentityError(403, "Only a designated receiving-account verifier may confirm these funds. Leave the claim pending and contact the owner.");
    if (!operationKey || !digitalOperationKeySchema.safeParse(operationKey).success) throw new IdentityError(400, "A valid confirmation key is required.");
    const fingerprint = createHash("sha256").update(JSON.stringify({ ...command, amount: parsePesos(command.amount), receivedAt: new Date(command.receivedAt).toISOString() })).digest("hex");
    await tx.$queryRaw`INSERT INTO idempotency_operations (id, gym_id, operation_type, operation_key, request_fingerprint)
      VALUES (${randomUUID()}::uuid, ${gymId}::uuid, 'DIGITAL_CONFIRMATION', ${operationKey}, ${fingerprint})
      ON CONFLICT (gym_id, operation_type, operation_key) DO NOTHING`;
    const operation = await tx.idempotencyOperation.findUniqueOrThrow({ where: { gymId_operationType_operationKey: { gymId, operationType: "DIGITAL_CONFIRMATION", operationKey } } });
    if (operation.requestFingerprint !== fingerprint) throw new IdentityError(409, "This confirmation key was used for different details.");
    if (operation.paymentId) return readPayment(tx, operation.paymentId);
    const charge = await tx.charge.findUniqueOrThrow({ where: { id: claim.chargeId } });
    await tx.$queryRaw`SELECT id FROM members WHERE id = ${charge.memberId}::uuid AND gym_id = ${gymId}::uuid FOR UPDATE`;
    // A second key must retrieve the single committed claim result, never sell another term.
    const settled = await tx.digitalSettlement.findUnique({ where: { claimId: claim.id } });
    if (settled) throw new DigitalConfirmationRejected(409, "This transfer is already confirmed. Open its existing receipt.");
    if (await tx.payment.findUnique({ where: { chargeId: charge.id } })) throw new DigitalConfirmationRejected(409, "This charge is already paid. Leave the transfer for owner review.");
    const account = await tx.receivingAccount.findUniqueOrThrow({ where: { id: claim.accountId } });
    const now = new Date(); const receivedAt = new Date(command.receivedAt);
    if (receivedAt > now || manilaDate(receivedAt) !== manilaDate(now) || manilaDate(claim.reportedReceivedAt) !== manilaDate(now)) {
      throw new DigitalConfirmationRejected(409, "Cross-date or future transfers remain pending for owner review. No membership was created.");
    }
    if (command.accountId !== claim.accountId || command.transactionReference !== claim.transactionReference
      || parsePesos(command.amount) !== charge.priceCentavos || claim.amountCentavos !== charge.priceCentavos) {
      throw new DigitalConfirmationRejected(400, "Match the designated account, transaction reference and exact full approved amount. Keep mismatches pending.");
    }
    await tx.$queryRaw`SELECT id FROM plans WHERE id = ${charge.planId}::uuid AND gym_id = ${gymId}::uuid FOR SHARE`;
    const plan = await tx.plan.findUniqueOrThrow({ where: { id: charge.planId } });
    if (plan.version !== charge.planVersion || plan.priceCentavos !== charge.priceCentavos || plan.durationDays !== charge.durationDays) {
      throw new DigitalConfirmationRejected(409, "The approved plan changed. Keep this claim pending for owner review.");
    }
    const intervals = await tx.effectiveEntitlement.findMany({ where: { memberId: charge.memberId, isCurrentProjection: true } });
    let proposed;
    try { proposed = proposedPeriod(now, charge.durationDays, intervals); }
    catch (error) { if (error instanceof IdentityError) throw new DigitalConfirmationRejected(error.status, error.message); throw error; }
    if (proposed.intendedStart.getTime() !== charge.intendedStart.getTime() || proposed.intendedEnd.getTime() !== charge.intendedEnd.getTime()) {
      throw new DigitalConfirmationRejected(409, "Reviewed membership dates changed. Keep the claim pending for owner review.");
    }
    const payment = await tx.payment.create({ data: { gymId, memberId: charge.memberId, chargeId: charge.id,
      reference: `${account.method}-${randomUUID().toUpperCase()}`, method: account.method, amountCentavos: charge.priceCentavos,
      collectedBy: claim.collectedBy, collectedAt: receivedAt, enteredAt: claim.enteredAt, verifiedBy: actor.operator.id, verifiedAt: now } });
    const period = await tx.membershipPeriod.create({ data: { gymId, memberId: charge.memberId, paymentId: payment.id,
      confirmedBy: actor.operator.id, startsAt: proposed.intendedStart, endsAt: proposed.intendedEnd } });
    await tx.effectiveEntitlement.create({ data: { gymId, memberId: charge.memberId, periodId: period.id, startsAt: period.startsAt, endsAt: period.endsAt } });
    const receipt = await tx.paymentReceipt.create({ data: { gymId, paymentId: payment.id, reference: `RECEIPT-${randomUUID().toUpperCase()}` } });
    await tx.digitalSettlement.create({ data: { gymId, claimId: claim.id, paymentId: payment.id, accountMatched: true, evidenceReference: command.evidenceReference } });
    await tx.identityAudit.create({ data: { gymId, initiatorId: actor.operator.userId, subjectId: payment.id, action: "DIGITAL_FUNDS_CONFIRMED" } });
    await tx.idempotencyOperation.update({ where: { id: operation.id }, data: { paymentId: payment.id, completedAt: now } });
    return { payment, period, receipt };
  });
}
