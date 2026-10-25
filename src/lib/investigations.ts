import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";
import { db } from "./db";
import { getActor, ownerInTransaction, IdentityError } from "./identity";
import { inGym } from "./tenant";
import { parsePesos } from "./money";
import { historyQuerySchema, investigationCommandSchema, investigationGates, investigationKeySchema } from "./investigation-schema";
import { recordIdSchema } from "./route-schema";
import { proposedPeriod } from "./charges";

export class CaseRecordRejected extends IdentityError {}

export async function paymentHistory(headers: Headers, input: unknown) {
  const parsed = historyQuerySchema.safeParse(input);
  if (!parsed.success) throw new IdentityError(400, "Check the history filters. Use a valid date or record reference.");
  const query = parsed.data;
  return inGym(headers, "MEMBERS", async (tx, actor) => {
    const start = query.date ? new Date(`${query.date}T00:00:00+08:00`) : null;
    const transfers = query.reference ? await tx.digitalClaim.findMany({ where: { transactionReference: { contains: query.reference, mode: "insensitive" } }, select: { chargeId: true } }) : [];
    const payments = await tx.payment.findMany({ where: {
      ...(query.memberId ? { memberId: query.memberId } : {}), ...(query.member ? { member: { fullName: { contains: query.member, mode: "insensitive" } } } : {}),
      ...(query.method ? { method: query.method } : {}), ...(query.collectorId ? { collectedBy: query.collectorId } : {}),
      ...(start ? { collectedAt: { gte: start, lt: new Date(start.getTime() + 86_400_000) } } : {}),
      ...(query.reference ? { OR: [{ reference: { contains: query.reference, mode: "insensitive" } }, { receipt: { reference: { contains: query.reference, mode: "insensitive" } } }, { chargeId: { in: transfers.map(row => row.chargeId) } }] } : {}),
    }, orderBy: [{ collectedAt: "desc" }, { id: "desc" }], take: 51,
    include: { member: { select: { fullName: true } }, collector: { select: { user: { select: { name: true } } } }, receipt: true, period: true } });
    const cases = await tx.investigationCase.findMany({ where: query.memberId ? { memberId: query.memberId } : {}, orderBy: [{ openedAt: "desc" }, { id: "desc" }], take: 51 });
    const events = await tx.investigationEvent.findMany({ where: { caseId: { in: cases.map(row => row.id) } }, orderBy: { revision: "desc" } });
    const operators = await tx.operator.findMany({ select: { id: true, user: { select: { name: true } } } });
    const member = query.memberId ? await tx.member.findUnique({ where: { id: query.memberId } }) : null;
    return { payments: payments.slice(0, 50), morePayments: payments.length > 50, cases: cases.slice(0, 50).map(row => ({ ...row, latest: events.find(event => event.caseId === row.id)! })),
      moreCases: cases.length > 50, operators, member, recoveryScope: `${actor.operator.gymId}:${actor.operator.id}` };
  });
}

export async function investigationDetail(headers: Headers, id: unknown) {
  const parsed = recordIdSchema.safeParse(id);
  if (!parsed.success) throw new IdentityError(404, "Case unavailable.");
  return inGym(headers, "MEMBERS", async (tx, actor) => {
    const record = await tx.investigationCase.findUnique({ where: { id: parsed.data } });
    if (!record) throw new IdentityError(404, "Case unavailable.");
    const events = await tx.investigationEvent.findMany({ where: { caseId: record.id }, orderBy: { revision: "asc" } });
    const member = await tx.member.findUniqueOrThrow({ where: { id: record.memberId } });
    const payments = await tx.payment.findMany({ where: { memberId: member.id }, include: { receipt: true, period: true }, orderBy: { collectedAt: "desc" } });
    const operators = await tx.operator.findMany({ select: { id: true, user: { select: { name: true } } } });
    const plans = await tx.plan.findMany({ orderBy: { durationDays: "asc" } });
    const recoveryCharges = await tx.charge.findMany({ where: { id: { in: events.flatMap(event => event.recoveryChargeId ? [event.recoveryChargeId] : []) } } });
    return { record, events, member, payments, operators, plans, recoveryCharges, owner: actor.operator.role === "OWNER", recoveryScope: `${actor.operator.gymId}:${actor.operator.id}` };
  });
}

export async function investigationCommand(headers: Headers, input: unknown, key: unknown) {
  const parsed = investigationCommandSchema.safeParse(input); const operationKey = investigationKeySchema.safeParse(key);
  if (!parsed.success || !operationKey.success) throw new IdentityError(400, "Check the case fields and operation key.");
  const command = parsed.data;
  if (command.action === "execute") {
    return inGym(headers, "OWNER", async tx => {
      if (!await tx.investigationCase.findUnique({ where: { id: command.caseId } })) throw new IdentityError(404, "Case unavailable.");
      throw new IdentityError(409, investigationGates.execution);
    });
  }
  // Normalize exact money/times for equivalent retries. Fingerprints contain no raw evidence in diagnostics.
  const normalized = { ...command,
    ...("amount" in command ? { amount: command.amount === "0" || command.amount === "0.00" ? 0 : parsePesos(command.amount) } : {}),
    ...("claimedAmount" in command && command.claimedAmount ? { claimedAmount: parsePesos(command.claimedAmount) } : {}),
    ...("effectiveAt" in command ? { effectiveAt: new Date(command.effectiveAt).toISOString() } : {}),
    ...("originalCollectedAt" in command && command.originalCollectedAt ? { originalCollectedAt: new Date(command.originalCollectedAt).toISOString() } : {}),
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  const write = async (tx: Prisma.TransactionClient, operator: { id: string; gymId: string; userId: string }) => {
    const gymId = operator.gymId;
    const replay = async () => {
      const existing = await tx.investigationEvent.findUnique({ where: { gymId_operationKey: { gymId, operationKey: operationKey.data } } });
      if (existing && existing.fingerprint !== fingerprint) throw new IdentityError(409, "This operation key belongs to different case details. Retrieve the original result.");
      return existing;
    };
    const existing = await replay(); if (existing) return existing;
    const record = command.action === "open" ? null : await tx.investigationCase.findUnique({ where: { id: command.caseId } });
    const memberId = command.action === "open" ? command.memberId : record?.memberId;
    if (!memberId || !await tx.member.findUnique({ where: { id: memberId } })) throw new IdentityError(404, "Member or case unavailable.");
    // Serialize case revisions and case creation with the existing tenant-safe member lock.
    await tx.$queryRaw`SELECT id FROM members WHERE id = ${memberId}::uuid AND gym_id = ${gymId}::uuid FOR UPDATE`;
    const committed = await replay(); if (committed) return committed;
    if (command.action === "open") {
      if (command.originalCollectedAt && new Date(command.originalCollectedAt).getTime() > Date.now()) throw new CaseRecordRejected(400, "Original collection time cannot be in the future.");
      const created = await tx.investigationCase.create({ data: { gymId, memberId, reason: command.reason, summary: command.summary, method: command.method,
        claimedCentavos: command.claimedAmount ? parsePesos(command.claimedAmount) : null, originalCollectedAt: command.originalCollectedAt ? new Date(command.originalCollectedAt) : null, openedBy: operator.id } });
      const event = await tx.investigationEvent.create({ data: { gymId, caseId: created.id, revision: 1, operationKey: operationKey.data, fingerprint,
        kind: "OPEN", outcome: "OPEN", reasoning: command.summary, evidenceReference: command.evidenceReference, actorId: operator.id } });
      await tx.identityAudit.create({ data: { gymId, initiatorId: operator.userId, subjectId: created.id, action: "INVESTIGATION_OPENED" } });
      return event;
    }
    const last = await tx.investigationEvent.findFirstOrThrow({ where: { caseId: record!.id }, orderBy: { revision: "desc" } });
    if (last.revision !== command.expectedRevision) throw new CaseRecordRejected(409, "Case changed. Reload and review its latest evidence before submitting.");
    const data: Prisma.InvestigationEventUncheckedCreateInput = { gymId, caseId: record!.id, revision: last.revision + 1,
      operationKey: operationKey.data, fingerprint, kind: command.action.toUpperCase(), outcome: last.outcome,
      reasoning: command.reasoning, evidenceReference: command.evidenceReference, actorId: operator.id };
    if ("independentEvidenceReference" in command && command.independentEvidenceReference) {
      if (command.independentEvidenceReference === command.evidenceReference) throw new CaseRecordRejected(400, "Provide a distinct independently corroborated evidence reference.");
      data.independentEvidenceReference = command.independentEvidenceReference;
    }
    if (["approveRecovery", "recover", "executeApproved", "settle"].includes(command.action)) {
      if (command.action === "approveRecovery" || command.action === "recover") {
        if (record!.reason !== "MISSING_PAYMENT" || record!.method !== "CASH" || !record!.originalCollectedAt || !record!.claimedCentavos) {
          throw new CaseRecordRejected(409, "Recovery needs a missing full cash payment with a verified original collection time and amount. Digital cross-date recovery remains blocked.");
        }
        if (record!.originalCollectedAt > new Date()) throw new CaseRecordRejected(400, "Collection cannot be in the future.");
        if (await tx.investigationEvent.findFirst({ where: { caseId: record!.id, kind: { in: ["RECOVER", "LINK"] } } })) throw new CaseRecordRejected(409, "Case already recovered or matched. Do not create another payment.");
        const intervals = await tx.effectiveEntitlement.findMany({ where: { memberId, isCurrentProjection: true } });
        if (command.action === "approveRecovery") {
          if (await tx.outageEntry.findFirst({ where: { OR: [{ cashReference: command.independentEvidenceReference }, { receiptReference: command.independentEvidenceReference }] } })) throw new CaseRecordRejected(409, "This collection has a controlled paper receipt entry. Use its independent outage verification or match its existing payment.");
          const plan = await tx.plan.findUnique({ where: { id: command.planId } });
          const collector = await tx.operator.findUnique({ where: { id: command.collectorId } });
          if (!plan || !collector || plan.priceCentavos !== record!.claimedCentavos) throw new CaseRecordRejected(400, "Verified full amount, approved plan and original collector must match this gym.");
          let dates;
          try { dates = proposedPeriod(record!.originalCollectedAt, plan.durationDays, intervals); }
          catch { throw new CaseRecordRejected(409, "Recovered dates conflict with existing paid periods. Retain for owner review."); }
          if (intervals.some(p => dates.intendedStart < p.endsAt && p.startsAt < dates.intendedEnd)) throw new CaseRecordRejected(409, "Recovered period overlaps an existing entitlement.");
          const charge = await tx.charge.create({ data: { gymId, memberId, planId: plan.id, planName: plan.name, durationDays: plan.durationDays,
            priceCentavos: plan.priceCentavos, planVersion: plan.version, preparedBy: operator.id, ...dates } });
          Object.assign(data, { kind: "APPROVE_RECOVERY", outcome: "APPROVED", recoveryPlanId: plan.id, recoveryChargeId: charge.id, recoveryCollectorId: collector.id,
            amountCentavos: charge.priceCentavos, effectiveAt: charge.intendedStart, accessOutcome: "ADJUSTS", moneyOutcome: "NO_MOVEMENT" });
        } else {
          const approval = await tx.investigationEvent.findFirst({ where: { id: command.approvalEventId, caseId: record!.id, kind: "APPROVE_RECOVERY", outcome: "APPROVED" } });
          if (!approval?.recoveryChargeId || !approval.recoveryCollectorId) throw new CaseRecordRejected(409, "Owner recovery approval is required.");
          if (await tx.outageEntry.findFirst({ where: { OR: [{ cashReference: approval.independentEvidenceReference! }, { receiptReference: approval.independentEvidenceReference! }] } })) throw new CaseRecordRejected(409, "This collection has a controlled paper receipt entry. Use its independent outage verification or match its existing payment.");
          if (await tx.investigationEvent.findFirst({ where: { kind: "RECOVER", independentEvidenceReference: approval.independentEvidenceReference } })) {
            throw new CaseRecordRejected(409, "This independently verified collection reference was already recovered. Match the existing payment instead.");
          }
          const charge = await tx.charge.findUniqueOrThrow({ where: { id: approval.recoveryChargeId } });
          let dates;
          try { dates = proposedPeriod(record!.originalCollectedAt, charge.durationDays, intervals); }
          catch { throw new CaseRecordRejected(409, "Recovered dates conflict with existing periods."); }
          if (dates.intendedStart.getTime() !== charge.intendedStart.getTime() || dates.intendedEnd.getTime() !== charge.intendedEnd.getTime()
            || intervals.some(p => dates.intendedStart < p.endsAt && p.startsAt < dates.intendedEnd)) throw new CaseRecordRejected(409, "Membership dates changed after approval. Retain for review.");
          const now = new Date();
          const payment = await tx.payment.create({ data: { gymId, memberId, chargeId: charge.id, amountCentavos: charge.priceCentavos, reference: `RECOVERED-CASH-${randomUUID()}`,
            collectedBy: approval.recoveryCollectorId, collectedAt: record!.originalCollectedAt, verifiedBy: operator.id, verifiedAt: now } });
          const period = await tx.membershipPeriod.create({ data: { gymId, memberId, paymentId: payment.id, confirmedBy: operator.id, startsAt: charge.intendedStart, endsAt: charge.intendedEnd } });
          await tx.effectiveEntitlement.create({ data: { gymId, memberId, periodId: period.id, startsAt: period.startsAt, endsAt: period.endsAt } });
          await tx.paymentReceipt.create({ data: { gymId, paymentId: payment.id, reference: `RECEIPT-${randomUUID()}` } });
          Object.assign(data, { outcome: "RECOVERED", paymentId: payment.id, approvalEventId: approval.id, independentEvidenceReference: approval.independentEvidenceReference });
        }
      } else if (command.action === "executeApproved") {
        const request = await tx.investigationEvent.findFirst({ where: { id: command.requestEventId, caseId: record!.id, kind: "REQUEST" } });
        const approval = request && await tx.investigationEvent.findFirst({ where: { requestEventId: request.id, kind: "REVIEW", decision: "APPROVE", outcome: "APPROVED" } });
        if (!request || !approval || !supportedAdjustment(request)) throw new CaseRecordRejected(409, "Execution blocked: exact supported owner approval and corroborated evidence required. O-03 discretionary cancellations remain blocked.");
        if (await tx.investigationEvent.findFirst({ where: { kind: "EXECUTE_APPROVED", OR: [
          { paymentId: { in: [request.paymentId!, ...(request.relatedPaymentId ? [request.relatedPaymentId] : [])] } }, { relatedPaymentId: request.paymentId },
        ] } })) throw new CaseRecordRejected(409, "These collections already participate in an executed adjustment. Retain for owner review.");
        const payment = await tx.payment.findUniqueOrThrow({ where: { id: request.paymentId! } });
        const related = request.relatedPaymentId ? await tx.payment.findUniqueOrThrow({ where: { id: request.relatedPaymentId } }) : null;
        if (request.reason === "TWO_COLLECTIONS" && (!related || request.amountCentavos !== payment.amountCentavos)) {
          throw new CaseRecordRejected(409, "Only the exact full independently evidenced unintended excess collection is supported.");
        }
        const projection = await tx.effectiveEntitlement.findUniqueOrThrow({ where: { periodId: request.periodId! } });
        if (!projection.isCurrentProjection) throw new CaseRecordRejected(409, "Affected entitlement already changed; owner review required.");
        if (request.accessOutcome === "ADJUSTS" && (!request.adjustedStartsAt || !request.adjustedEndsAt || request.adjustedStartsAt >= request.adjustedEndsAt
          || request.adjustedStartsAt < projection.startsAt || request.adjustedEndsAt > projection.endsAt)) throw new CaseRecordRejected(409, "Explicit adjusted dates must retain a valid subset of the affected original period.");
        if (request.accessOutcome === "ADJUSTS" && request.effectiveAt! > new Date()
          && ((request.adjustedStartsAt!.getTime() !== projection.startsAt.getTime() && request.effectiveAt! > projection.startsAt)
            || request.adjustedEndsAt!.getTime() < Math.min(request.effectiveAt!.getTime(), projection.endsAt.getTime()))) {
          throw new CaseRecordRejected(409, "Adjusted dates would change access before the approved effective time. Retain for owner review.");
        }
        const event = await tx.investigationEvent.create({ data: { ...data, kind: "EXECUTE_APPROVED", outcome: request.moneyOutcome === "REFUND_PROPOSED" ? "AWAITING_SETTLEMENT" : "COMPLETED",
          requestEventId: request.id, approvalEventId: approval.id, paymentId: payment.id, relatedPaymentId: related?.id, periodId: request.periodId, amountCentavos: request.amountCentavos,
          method: request.method, accessOutcome: request.accessOutcome, effectiveAt: request.effectiveAt } });
        if (request.accessOutcome === "ENDS" && request.effectiveAt! < projection.endsAt) {
          await tx.effectiveEntitlement.update({ where: { id: projection.id }, data: request.effectiveAt! <= projection.startsAt ? { isCurrentProjection: false } : { endsAt: request.effectiveAt! } });
        } else if (request.accessOutcome === "ADJUSTS") {
          await tx.effectiveEntitlement.update({ where: { id: projection.id }, data: { startsAt: request.adjustedStartsAt!, endsAt: request.adjustedEndsAt! } });
        }
        await tx.identityAudit.create({ data: { gymId, initiatorId: operator.userId, subjectId: record!.id, action: "INVESTIGATION_EXECUTE_APPROVED" } });
        return event;
      } else if (command.action === "settle") {
        const execution = await tx.investigationEvent.findFirst({ where: { id: command.executionEventId, caseId: record!.id, kind: "EXECUTE_APPROVED", outcome: "AWAITING_SETTLEMENT" } });
        if (!execution || command.method !== execution.method || parsePesos(command.amount) !== execution.amountCentavos) throw new CaseRecordRejected(409, "Settlement must match the pending full refund amount and method.");
        if (new Date(command.settledAt) > new Date() || new Date(command.settledAt) < execution.createdAt) throw new CaseRecordRejected(400, "Settlement time must be after execution and no later than now.");
        if (await tx.investigationEvent.findFirst({ where: { kind: "SETTLE", OR: [{ executionEventId: execution.id }, { settlementReference: command.settlementReference }] } })) throw new CaseRecordRejected(409, "Refund already settled or settlement reference already used.");
        Object.assign(data, { kind: "SETTLE", outcome: "COMPLETED", executionEventId: execution.id, settlementReference: command.settlementReference,
          settledAt: new Date(command.settledAt), amountCentavos: execution.amountCentavos, method: execution.method });
      }
    }
    if (command.action === "escalate") data.outcome = "ESCALATED";
    if (command.action === "link" || command.action === "request") {
      const payment = await tx.payment.findFirst({ where: { id: command.paymentId, memberId }, include: { period: true } });
      if (!payment) throw new CaseRecordRejected(404, "This member's confirmed payment is unavailable.");
      data.paymentId = payment.id;
      if (command.action === "link") data.outcome = "MATCHED";
      else {
        if (command.reason === "MISSING_PAYMENT") throw new CaseRecordRejected(400, "A confirmed-payment request needs a correction or refund classification.");
        const amount = command.amount === "0" || command.amount === "0.00" ? 0 : parsePesos(command.amount)!;
        if ((command.moneyOutcome === "NO_MOVEMENT") !== (amount === 0)) throw new CaseRecordRejected(400, "No movement requires zero PHP; proposed movement requires a positive exact amount.", { amount: "Check the amount against the proposed money outcome." });
        if (command.periodId !== payment.period?.id) throw new CaseRecordRejected(400, "Identify the original affected paid period.");
        const related = command.relatedPaymentId ? await tx.payment.findFirst({ where: { id: command.relatedPaymentId, memberId }, include: { period: true } }) : null;
        if (command.relatedPaymentId && (!related || related.id === payment.id)) throw new CaseRecordRejected(400, "Identify a different confirmed payment for this member.");
        if (command.retainedPeriodId && command.retainedPeriodId !== related?.period?.id) throw new CaseRecordRejected(400, "The retained period must belong to the related payment.");
        if (command.reason === "DUPLICATE_RECORD" && (command.collectionCount !== "ONE" || !related || command.moneyOutcome !== "NO_MOVEMENT" || !command.retainedPeriodId)) {
          throw new CaseRecordRejected(400, "A duplicate-record request requires one actual collection, two records, a retained period and zero money movement. Two actual collections require a separate excess-payment review.");
        }
        if (command.reason === "TWO_COLLECTIONS" && (command.collectionCount !== "TWO" || !related)) throw new CaseRecordRejected(400, "Two actual collections require both recorded payments and explicit excess-payment review.");
        Object.assign(data, { outcome: "OWNER_REVIEW", relatedPaymentId: related?.id, reason: command.reason, collectionCount: command.collectionCount,
          amountCentavos: amount, method: command.method, moneyOutcome: command.moneyOutcome, accessOutcome: command.accessOutcome,
          effectiveAt: new Date(command.effectiveAt), periodId: command.periodId, retainedPeriodId: command.retainedPeriodId,
          independentEvidenceReference: command.independentEvidenceReference, sameObligation: command.sameObligation, unintendedCollection: command.unintendedCollection,
          adjustedStartsAt: command.adjustedStartsAt ? new Date(command.adjustedStartsAt) : null, adjustedEndsAt: command.adjustedEndsAt ? new Date(command.adjustedEndsAt) : null });
      }
    }
    if (command.action === "review") {
      const request = await tx.investigationEvent.findFirst({ where: { id: command.requestEventId, caseId: record!.id, kind: "REQUEST" } });
      if (!request) throw new CaseRecordRejected(404, "Correction/refund request unavailable for this case.");
      if (await tx.investigationEvent.findFirst({ where: { requestEventId: request.id, kind: "REVIEW" } })) throw new CaseRecordRejected(409, "This request already has an owner decision. Preserve it; submit a new request if evidence changes.");
      Object.assign(data, { requestEventId: request.id, decision: command.decision, outcome: command.decision === "APPROVE" ? supportedAdjustment(request) ? "APPROVED" : "APPROVED_BLOCKED" : "REJECTED" });
    }
    const event = await tx.investigationEvent.create({ data });
    await tx.identityAudit.create({ data: { gymId, initiatorId: operator.userId, subjectId: record!.id, action: `INVESTIGATION_${data.kind}` } });
    return event;
  };
  // Owner review takes the exclusive gym lock directly; never upgrade an inGym shared lock.
  if (["review", "approveRecovery", "recover", "executeApproved", "settle"].includes(command.action)) {
    const actor = await getActor(headers);
    return db.$transaction(async tx => write(tx, await ownerInTransaction(tx, actor)));
  }
  return inGym(headers, "MEMBERS", (tx, actor) => write(tx, actor.operator));
}

function supportedAdjustment(request: { reason: string | null; collectionCount: string | null; moneyOutcome: string | null; amountCentavos: number | null;
  relatedPaymentId: string | null; retainedPeriodId: string | null; independentEvidenceReference: string | null; sameObligation: boolean | null; unintendedCollection: boolean | null;
  accessOutcome: string | null; adjustedStartsAt: Date | null; adjustedEndsAt: Date | null }) {
  if (!request.independentEvidenceReference) return false;
  if (request.accessOutcome === "ADJUSTS" && (!request.adjustedStartsAt || !request.adjustedEndsAt)) return false;
  return (request.reason === "DUPLICATE_RECORD" && request.collectionCount === "ONE" && request.moneyOutcome === "NO_MOVEMENT" && request.amountCentavos === 0 && !!request.retainedPeriodId && !!request.relatedPaymentId)
    || (request.reason === "TWO_COLLECTIONS" && request.collectionCount === "TWO" && request.moneyOutcome === "REFUND_PROPOSED" && request.sameObligation === true && request.unintendedCollection === true && !!request.relatedPaymentId)
    || (["INCORRECT_ENTRY", "FUNDS_ABSENT"].includes(request.reason ?? "") && request.moneyOutcome === "NO_MOVEMENT" && request.amountCentavos === 0);
}
