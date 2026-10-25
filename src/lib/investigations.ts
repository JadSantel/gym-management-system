import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";
import { db } from "./db";
import { getActor, ownerInTransaction, IdentityError } from "./identity";
import { inGym } from "./tenant";
import { parsePesos } from "./money";
import { historyQuerySchema, investigationCommandSchema, investigationGates, investigationKeySchema } from "./investigation-schema";
import { recordIdSchema } from "./route-schema";

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
    return { record, events, member, payments, operators, owner: actor.operator.role === "OWNER", recoveryScope: `${actor.operator.gymId}:${actor.operator.id}` };
  });
}

export async function investigationCommand(headers: Headers, input: unknown, key: unknown) {
  const parsed = investigationCommandSchema.safeParse(input); const operationKey = investigationKeySchema.safeParse(key);
  if (!parsed.success || !operationKey.success) throw new IdentityError(400, "Check the case fields and operation key.");
  const command = parsed.data;
  if (command.action === "recover" || command.action === "execute") {
    return inGym(headers, command.action === "execute" ? "OWNER" : "MEMBERS", async tx => {
      if (!await tx.investigationCase.findUnique({ where: { id: command.caseId } })) throw new IdentityError(404, "Case unavailable.");
      throw new IdentityError(409, command.action === "recover" ? investigationGates.recovery : investigationGates.execution);
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
          effectiveAt: new Date(command.effectiveAt), periodId: command.periodId, retainedPeriodId: command.retainedPeriodId });
      }
    }
    if (command.action === "review") {
      const request = await tx.investigationEvent.findFirst({ where: { id: command.requestEventId, caseId: record!.id, kind: "REQUEST" } });
      if (!request) throw new CaseRecordRejected(404, "Correction/refund request unavailable for this case.");
      if (await tx.investigationEvent.findFirst({ where: { requestEventId: request.id, kind: "REVIEW" } })) throw new CaseRecordRejected(409, "This request already has an owner decision. Preserve it; submit a new request if evidence changes.");
      Object.assign(data, { requestEventId: request.id, decision: command.decision, outcome: command.decision === "APPROVE" ? "APPROVED_BLOCKED" : "REJECTED" });
    }
    const event = await tx.investigationEvent.create({ data });
    await tx.identityAudit.create({ data: { gymId, initiatorId: operator.userId, subjectId: record!.id, action: `INVESTIGATION_${data.kind}` } });
    return event;
  };
  // Owner review takes the exclusive gym lock directly; never upgrade an inGym shared lock.
  if (command.action === "review") {
    const actor = await getActor(headers);
    return db.$transaction(async tx => write(tx, await ownerInTransaction(tx, actor)));
  }
  return inGym(headers, "MEMBERS", (tx, actor) => write(tx, actor.operator));
}
