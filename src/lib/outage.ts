import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";
import { db } from "./db";
import { getActor, IdentityError, ownerInTransaction } from "./identity";
import { authorize, inGym } from "./tenant";
import { proposedPeriod } from "./charges";
import { parsePesos } from "./money";
import { outageCommandSchema, outageKeySchema } from "./outage-schema";

export class OutageRejected extends IdentityError {}
type Tx = Prisma.TransactionClient;
type Actor = { id: string; gymId: string; userId: string; role: string; canCollectCash: boolean; canManageMembers: boolean };
function reject(status: number, message: string): never { throw new OutageRejected(status, message); }
const cash = (value: string) => value === "0" || value === "0.00" ? 0 : parsePesos(value)!;
const countsOf = (value: Prisma.JsonValue) => value as { used: number[]; unused: number[]; void: number[]; missing: number[] };

export async function outageOverview(headers: Headers) {
  return inGym(headers, "MEMBERS", async (tx, actor) => {
    const books = await tx.outageBook.findMany({ orderBy: { createdAt: "desc" } });
    const prices = await tx.outagePrice.findMany();
    const entries = await tx.outageEntry.findMany({ orderBy: { enteredAt: "desc" } });
    const confirmations = await tx.outageConfirmation.findMany();
    const handovers = await tx.outageHandover.findMany({ orderBy: { actualAt: "asc" } });
    const events = await tx.outageEvent.findMany({ orderBy: { createdAt: "desc" } });
    const verifiers = await tx.outageVerifier.findMany();
    const operators = await tx.operator.findMany({ select: { id: true, state: true, role: true, canCollectCash: true, user: { select: { name: true } } } });
    const members = await tx.member.findMany({ where: { id: { in: entries.map(entry => entry.memberId) } }, select: { id: true, fullName: true } });
    const receipts = await tx.paymentReceipt.findMany({ where: { paymentId: { in: confirmations.map(row => row.paymentId) } }, include: { payment: { select: { verifiedAt: true, verifiedBy: true } } } });
    return { books, prices, entries, confirmations, handovers, events, verifiers, operators, members, receipts,
      owner: actor.operator.role === "OWNER", operatorId: actor.operator.id, recoveryScope: `${actor.operator.gymId}:${actor.operator.id}` };
  });
}

export async function outageCommand(headers: Headers, input: unknown, key: unknown) {
  const parsed = outageCommandSchema.safeParse(input); const parsedKey = outageKeySchema.safeParse(key);
  if (!parsed.success || !parsedKey.success) reject(400, "Check the outage fields and operation key.");
  const command = parsed.data!; const operationKey = parsedKey.data!;
  const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  const write = async (tx: Tx, actor: Actor) => {
    const gymId = actor.gymId;
    const replay = async () => {
      const found = await tx.outageEvent.findUnique({ where: { gymId_operationKey: { gymId, operationKey } } });
      if (found && found.fingerprint !== fingerprint) reject(409, "This operation key belongs to other details. Retrieve the original operation.");
      return found;
    };
    const existing = await replay(); if (existing) return existing;
    let bookId: string | undefined = "bookId" in command ? command.bookId : undefined;
    let number: number | undefined = "number" in command ? command.number : undefined;
    let memberId: string | undefined; let caseId: string | undefined;
    let outcome = "RECORDED"; let result: Prisma.InputJsonObject = {};
    const now = new Date();
    async function incident(member: string | null, summary: string, evidenceReference: string) {
      if (!member) return;
      if (!await tx.member.findUnique({ where: { id: member } })) reject(404, "Member unavailable.");
      memberId = member;
      const record = await tx.investigationCase.create({ data: { gymId, memberId: member, reason: "INCORRECT_ENTRY", method: "UNKNOWN", summary, openedBy: actor.id } });
      caseId = record.id;
      await tx.investigationEvent.create({ data: { gymId, caseId, revision: 1, operationKey: randomUUID(), fingerprint, kind: "OPEN", outcome: "OWNER_REVIEW", reasoning: summary, evidenceReference, actorId: actor.id } });
    }
    if (command.action === "verifier") {
      const operator = await tx.operator.findUnique({ where: { id: command.operatorId } });
      if (!operator || operator.state !== "ACTIVE") reject(404, "Active operator unavailable.");
      await tx.outageVerifier.upsert({ where: { gymId_operatorId: { gymId, operatorId: command.operatorId } },
        create: { gymId, operatorId: command.operatorId, active: command.active }, update: { active: command.active } });
    } else if (command.action === "register") {
      if (command.last < command.first || command.last - command.first >= 200) reject(400, "Register 1–200 physical leaves per booklet range.");
      const operator = await tx.operator.findUnique({ where: { id: command.custodianId } });
      if (!operator || operator.state !== "ACTIVE" || (operator.role !== "OWNER" && !operator.canCollectCash)) reject(400, "Assign an active authorized cash collector.");
      if (await tx.outageBook.findUnique({ where: { gymId_code: { gymId, code: command.code } } })) reject(409, "This booklet code is already registered. Numbers cannot be recycled.");
      const plans = await tx.plan.findMany();
      if (!plans.length) reject(409, "Initialize the approved catalogue before registering a booklet.");
      // Price administration uses the same exclusive gym lock. Keep its approved paper copy with this book.
      const book = await tx.outageBook.create({ data: { gymId, code: command.code, firstNumber: command.first, lastNumber: command.last, custodianId: command.custodianId, createdBy: actor.id } });
      bookId = book.id;
      await tx.outagePrice.createMany({ data: plans.map(plan => ({ id: randomUUID(), gymId, bookId: book.id, planId: plan.id, planName: plan.name, durationDays: plan.durationDays, priceCentavos: plan.priceCentavos, planVersion: plan.version })) });
      result = { bookId };
    } else {
      await tx.$queryRaw`SELECT id FROM outage_books WHERE id=${bookId}::uuid AND gym_id=${gymId}::uuid FOR UPDATE`;
      const committed = await replay(); if (committed) return committed;
      const book = await tx.outageBook.findUnique({ where: { id: bookId } });
      if (!book) return reject(404, "Controlled booklet unavailable.");
      if (number !== undefined && (number < book.firstNumber || number > book.lastNumber)) reject(400, "Receipt number is outside the registered range.");
      const handovers = await tx.outageHandover.findMany({ where: { bookId }, orderBy: { actualAt: "asc" } });
      const events = await tx.outageEvent.findMany({ where: { bookId, kind: "EXCEPTION" } });
      const blocked = (n: number) => events.some(event => event.number === n && !["LOST_COPY", "LATER_VISIT"].includes((event.command as { kind: string }).kind))
        || handovers.some(h => countsOf(h.counts).missing.includes(n) || countsOf(h.counts).void.includes(n));
      const custodianAt = (at: Date) => handovers.filter(h => h.actualAt <= at).at(-1)?.toId ?? book.custodianId;
      if (command.action === "enter") {
        authorize(actor, "CASH");
        memberId = command.memberId;
        if (!await tx.member.findUnique({ where: { id: memberId } })) reject(404, "Member unavailable.");
        const prior = await tx.outageEntry.findUnique({ where: { bookId_number: { bookId: book.id, number: command.number } } });
        if (prior) {
          outcome = "OWNER_REVIEW";
          await incident(prior.memberId, `Duplicate or conflicting paper receipt ${book.code}-${command.number}; original preserved.`, command.receiptReference);
          result = { entryId: prior.id };
        } else {
          const price = await tx.outagePrice.findUnique({ where: { id: command.priceId } });
          if (!price || price.bookId !== book.id || parsePesos(command.amount) !== price.priceCentavos) reject(400, "Full cash must match this booklet's approved historical price snapshot. Uncertain prices remain unavailable.");
          const collectedAt = new Date(command.collectedAt); const issuedAt = new Date(command.issuedAt);
          if (collectedAt < book.createdAt || issuedAt < collectedAt || issuedAt > now) reject(400, "Use actual collection/issuance times after booklet registration and before entry.");
          if (await tx.identityAudit.findFirst({ where: { subjectId: price.planId, action: { startsWith: "PLAN_PRICE_CHANGED_" }, createdAt: { gte: book.createdAt, lte: collectedAt } } })) reject(409, "The approved price changed before collection. This booklet snapshot cannot establish the historical full price. Preserve an owner investigation.");
          if (custodianAt(collectedAt) !== command.collectorId || custodianAt(issuedAt) !== command.collectorId) reject(409, "Collector does not match custody at collection and issuance.");
          if (blocked(command.number)) reject(409, "This number has an unresolved exception. Preserve it for owner review.");
          if (handovers.some(h => h.actualAt >= issuedAt && !countsOf(h.counts).used.includes(command.number))) reject(409, "Receipt conflicts with the physical handover counts. Retain the evidence for owner review.");
          if (command.visit) {
            const at = new Date(command.visit.at);
            const authorizer = await tx.operator.findUnique({ where: { id: command.visit.authorizerId } });
            if (!authorizer || (authorizer.role !== "OWNER" && !authorizer.canCollectCash) || at < issuedAt || at > now) reject(400, "Document an authorized original visit after issuance, before entry.");
          }
          if (command.receiptReference === command.cashReference) reject(400, "Use separate receipt and cash record references.");
          if (await tx.outageEntry.findFirst({ where: { OR: [{ receiptReference: command.receiptReference }, { cashReference: command.cashReference }] } })) reject(409, "This original receipt or cash record is already linked. Investigate rather than entering another collection.");
          const entry = await tx.outageEntry.create({ data: { gymId, bookId: book.id, number: command.number, memberId, priceId: price.id, amountCentavos: price.priceCentavos,
            collectorId: command.collectorId, collectedAt, issuedAt, enteredBy: actor.id, receiptReference: command.receiptReference, cashReference: command.cashReference,
            visitAt: command.visit ? new Date(command.visit.at) : null, visitAuthorizerId: command.visit?.authorizerId, visitReference: command.visit?.reference } });
          outcome = "PENDING"; result = { entryId: entry.id };
        }
      } else if (command.action === "exception") {
        authorize(actor, "CASH");
        const at = new Date(command.actualAt);
        if (at < book.createdAt || at > now) reject(400, "Use an actual incident time after registry and before entry.");
        await incident(command.memberId, `${command.kind}: ${command.reasoning}`, command.evidenceReference);
        outcome = "OWNER_REVIEW";
      } else if (command.action === "handover") {
        authorize(actor, "CASH");
        const at = new Date(command.actualAt); const last = handovers.at(-1);
        if (at < book.createdAt || at > now || (last && at <= last.actualAt)) reject(400, "Enter handovers in actual chronological order, after registration and before recovery entry.");
        const receiver = await tx.operator.findUnique({ where: { id: command.toId } });
        if (!receiver || receiver.state !== "ACTIVE" || (receiver.role !== "OWNER" && !receiver.canCollectCash)) reject(400, "Choose an active authorized incoming cash custodian.");
        const counts = { used: command.used, unused: command.unused, void: command.void, missing: command.missing };
        const all = Object.values(counts).flat();
        if (all.length !== book.lastNumber - book.firstNumber + 1 || new Set(all).size !== all.length || all.some(n => n < book.firstNumber || n > book.lastNumber)) reject(400, "Physically account for each controlled number exactly once as used, unused, void or missing.");
        if (last && ["used", "void", "missing"].some(kind => (countsOf(last.counts)[kind as keyof typeof counts]).some(n => !counts[kind as keyof typeof counts].includes(n)))) reject(409, "Used, void and missing numbers cannot silently return to circulation. Retain differences for owner review.");
        const entries = await tx.outageEntry.findMany({ where: { bookId } });
        if (entries.some(e => e.issuedAt <= at ? !counts.used.includes(e.number) : !counts.unused.includes(e.number))) reject(409, "Physical counts conflict with recorded receipt issuance times. Preserve the difference for owner review.");
        const handover = await tx.outageHandover.create({ data: { gymId, bookId: book.id, fromId: last?.toId ?? book.custodianId, toId: command.toId, actualAt: at, enteredBy: actor.id,
          counts, cashHeld: cash(command.cashHeld), cashTransferred: cash(command.cashTransferred), transferReference: command.transferReference, evidenceReference: command.evidenceReference, outstanding: command.outstanding } });
        result = { handoverId: handover.id }; outcome = counts.missing.length || counts.void.length ? "OWNER_REVIEW" : "RECORDED";
      } else {
        const entry = await tx.outageEntry.findUnique({ where: { id: command.entryId } });
        if (!entry || entry.bookId !== book.id) return reject(404, "Pending receipt unavailable.");
        number = entry.number; memberId = entry.memberId;
        const confirmation = await tx.outageConfirmation.findUnique({ where: { entryId: entry.id } });
        if (confirmation) reject(409, "Receipt already verified. Retrieve the original operation or linked receipt.");
        const grant = await tx.outageVerifier.findUnique({ where: { gymId_operatorId: { gymId, operatorId: actor.id } } });
        if (!grant?.active || actor.id === entry.collectorId || actor.id === entry.enteredBy) reject(403, "A designated verifier independent of both collector and entrant is required. Keep this receipt pending.");
        if (blocked(entry.number) || await tx.outageEvent.findFirst({ where: { bookId, number: entry.number, outcome: "OWNER_REVIEW", kind: "ENTER" } })) reject(409, "Unresolved receipt exception requires owner investigation. No entitlement changed.");
        const handover = handovers.find(h => h.actualAt >= entry.issuedAt && h.fromId === entry.collectorId && countsOf(h.counts).used.includes(entry.number));
        if (!handover) reject(409, "Recover the signed physical handover listing this used number before verification.");
        if (new Set([command.receiptEvidence, command.cashEvidence, command.custodyEvidence]).size !== 3) reject(400, "Supply distinct independently matched receipt, cash and custody references.");
        await tx.$queryRaw`SELECT id FROM members WHERE id=${entry.memberId}::uuid AND gym_id=${gymId}::uuid FOR UPDATE`;
        if (await tx.investigationEvent.findFirst({ where: { kind: "RECOVER", independentEvidenceReference: { in: [entry.cashReference, entry.receiptReference] } } })) reject(409, "This collection was already recovered through an owner investigation. Match its existing payment; do not confirm again.");
        const price = await tx.outagePrice.findUniqueOrThrow({ where: { id: entry.priceId } });
        if (await tx.identityAudit.findFirst({ where: { subjectId: price.planId, action: { startsWith: "PLAN_PRICE_CHANGED_" }, createdAt: { gte: book.createdAt, lte: entry.collectedAt } } })) reject(409, "The approved price changed before collection. Historical price uncertainty requires owner investigation; no payment was recorded.");
        const intervals = await tx.effectiveEntitlement.findMany({ where: { memberId: entry.memberId, isCurrentProjection: true } });
        let dates;
        try { dates = proposedPeriod(entry.collectedAt, price.durationDays, intervals); }
        catch { return reject(409, "Original dates conflict with existing or queued paid terms. Retain for owner review."); }
        if (intervals.some(p => dates.intendedStart < p.endsAt && p.startsAt < dates.intendedEnd)) reject(409, "Recovered dates overlap existing paid time. Retain for owner review.");
        const charge = await tx.charge.create({ data: { gymId, memberId: entry.memberId, planId: price.planId, planName: price.planName, durationDays: price.durationDays,
          priceCentavos: price.priceCentavos, planVersion: price.planVersion, preparedBy: entry.enteredBy, ...dates } });
        const payment = await tx.payment.create({ data: { gymId, memberId: entry.memberId, chargeId: charge.id, outageEntryId: entry.id, amountCentavos: entry.amountCentavos,
          reference: `OUTAGE-${randomUUID().toUpperCase()}`, collectedBy: entry.collectorId, collectedAt: entry.collectedAt, enteredAt: entry.enteredAt, verifiedBy: actor.id, verifiedAt: now } });
        const period = await tx.membershipPeriod.create({ data: { gymId, memberId: entry.memberId, paymentId: payment.id, confirmedBy: actor.id, startsAt: dates.intendedStart, endsAt: dates.intendedEnd } });
        await tx.effectiveEntitlement.create({ data: { gymId, memberId: entry.memberId, periodId: period.id, startsAt: period.startsAt, endsAt: period.endsAt } });
        const receipt = await tx.paymentReceipt.create({ data: { gymId, paymentId: payment.id, reference: `RECEIPT-${randomUUID().toUpperCase()}` } });
        await tx.outageConfirmation.create({ data: { gymId, entryId: entry.id, paymentId: payment.id, handoverId: handover.id,
          receiptEvidence: command.receiptEvidence, cashEvidence: command.cashEvidence, custodyEvidence: command.custodyEvidence } });
        result = { entryId: entry.id, paymentId: payment.id, periodId: period.id, receiptId: receipt.id }; outcome = "VERIFIED";
      }
    }
    const event = await tx.outageEvent.create({ data: { gymId, bookId, number, memberId, caseId, kind: command.action.toUpperCase(), outcome, operationKey, fingerprint, command, result, actorId: actor.id } });
    await tx.identityAudit.create({ data: { gymId, initiatorId: actor.userId, subjectId: event.id, action: `OUTAGE_${event.kind}_${outcome}` } });
    return event;
  };
  if (["register", "verifier"].includes(command.action)) {
    const actor = await getActor(headers);
    return db.$transaction(async tx => write(tx, await ownerInTransaction(tx, actor)));
  }
  return inGym(headers, "MEMBERS", (tx, actor) => write(tx, actor.operator));
}
