import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";
import { authorize, inGym } from "./tenant";
import { IdentityError, ownerInTransaction } from "./identity";
import { closingCommandSchema, closingDaySchema, closingKeySchema } from "./closing-schema";
import { parsePesos } from "./money";

export class ClosingRejected extends IdentityError {}
function reject(status: number, message: string): never { throw new ClosingRejected(status, message); }
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
const cents = (value: string) => value === "0" || value === "0.00" ? 0 : parsePesos(value)!;
export const previousClosingDay = () => new Date(Date.now()+8*3600_000-86400_000).toISOString().slice(0,10);
function bounded(value: number) {
  if (!Number.isSafeInteger(value) || value < -2_147_483_647 || value > 2_147_483_647) reject(409, "Closing amount exceeds the supported centavo range. Retain for owner review.");
  return value;
}
export function closingBounds(day: string) {
  const parsed = closingDaySchema.safeParse(day);
  if (!parsed.success) reject(400, "Choose a valid business date.");
  const start = new Date(`${parsed.data}T00:00:00+08:00`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}
export type ClosingRow = { collectorId: string; method: string; recorded: number; excluded: number; refunds: number };
export type ClosingItem = { kind: string; reference: string; href: string; detail: string };

async function latestChecks(tx: Prisma.TransactionClient, day: string) {
  const checks = await tx.closingCheck.findMany({ where: { day }, orderBy: { ordinal: "asc" } });
  const latest = new Map<string,typeof checks[number]>();
  for (const check of checks) latest.set(`${check.collectorId}:${check.method}:${check.accountId ?? "CASH"}`,check);
  return [...latest.values()];
}

// Called only while holding the gym UPDATE lock. Ordinary financial commands hold SHARE;
// owner commands hold UPDATE. This bounds source capture without changing those commands.
async function sourceFor(tx: Prisma.TransactionClient, day: string) {
  const { start, end } = closingBounds(day);
  const payments = await tx.payment.findMany({ where: { collectedAt: { lt: end } }, orderBy: { id: "asc" }, include: { receipt: true } });
  const claims = await tx.digitalClaim.findMany({ where: { reportedReceivedAt: { lt: end } }, orderBy: { id: "asc" } });
  const settlements = await tx.digitalSettlement.findMany({ orderBy: { id: "asc" } });
  const accounts = await tx.receivingAccount.findMany({ orderBy: { id: "asc" } });
  const books = await tx.outageBook.findMany({ where: { createdAt: { lt: end } }, orderBy: { id: "asc" } });
  const entries = await tx.outageEntry.findMany({ where: { collectedAt: { lt: end } }, orderBy: { id: "asc" } });
  const confirmations = await tx.outageConfirmation.findMany({ orderBy: { id: "asc" } });
  const handovers = await tx.outageHandover.findMany({ orderBy: [{ actualAt: "asc" }, { id: "asc" }] });
  const outageEvents = await tx.outageEvent.findMany({ orderBy: { id: "asc" } });
  const cases = await tx.investigationCase.findMany({ orderBy: { id: "asc" } });
  const events = await tx.investigationEvent.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const flags = await tx.paymentFlag.findMany({ orderBy: { id: "asc" } });
  const rows = new Map<string, ClosingRow>();
  const row = (collectorId: string, method: string) => {
    const key = `${collectorId}:${method}`;
    if (!rows.has(key)) rows.set(key, { collectorId, method, recorded: 0, excluded: 0, refunds: 0 });
    return rows.get(key)!;
  };
  const today = (at: Date) => at >= start && at < end;
  const excluded = new Set<string>();
  for (const e of events.filter(e => e.kind === "EXECUTE_APPROVED")) {
    const request = events.find(r => r.id === e.requestEventId);
    if (request && ["DUPLICATE_RECORD", "FUNDS_ABSENT"].includes(request.reason ?? "") && request.paymentId) excluded.add(request.paymentId);
  }
  for (const payment of payments.filter(p => today(p.collectedAt))) {
    const line = row(payment.collectedBy, payment.method);
    line.recorded = bounded(line.recorded + payment.amountCentavos);
    if (excluded.has(payment.id)) line.excluded = bounded(line.excluded + payment.amountCentavos);
  }
  const refunds = events.filter(e => e.kind === "SETTLE" && e.settledAt);
  // A same-day refund may refer to a payment later than this day's end only if source data
  // is invalid; the existing settlement flow forbids that. Resolve through its execution.
  const refundMovements = [];
  for (const settlement of refunds.filter(e => today(e.settledAt!))) {
    const execution = events.find(e => e.id === settlement.executionEventId);
    const payment = payments.find(p => p.id === execution?.paymentId);
    if (!payment || !settlement.method || !settlement.amountCentavos) reject(409, "Refund source is incomplete. Retain for owner review.");
    // The approved SOP allocates net reporting to the original collection method.
    // Actual payout method remains a separate fact, including cash-batch evidence.
    const line = row(payment.collectedBy, payment.method);
    line.refunds = bounded(line.refunds + settlement.amountCentavos);
    refundMovements.push({ id: settlement.id, caseId: settlement.caseId, paymentId: payment.id,
      collectorId: payment.collectedBy, originalMethod: payment.method, actualMethod: settlement.method,
      amountCentavos: settlement.amountCentavos, collectedAt: payment.collectedAt, settledAt: settlement.settledAt!,
      enteredAt: settlement.createdAt, settledBy: settlement.actorId, settlementReference: settlement.settlementReference });
  }
  const items: ClosingItem[] = [];
  for (const claim of claims.filter(c => !settlements.some(s => s.claimId === c.id))) {
    items.push({ kind: "PENDING_TRANSFER", reference: claim.id, href: "/digital", detail: `${claim.transactionReference}: ${claim.amountCentavos} centavos unconfirmed; reported ${claim.reportedReceivedAt.toISOString()}` });
  }
  for (const entry of entries.filter(e => !confirmations.some(c => c.entryId === e.id))) {
    items.push({ kind: "PENDING_PAPER", reference: entry.id, href: "/outage-receipts", detail: `${entry.number}: ${entry.amountCentavos} centavos pending independent verification; collected ${entry.collectedAt.toISOString()}` });
  }
  for (const book of books) {
    const history = handovers.filter(h => h.bookId === book.id && h.actualAt < end);
    const latest = history.at(-1);
    if (!latest) items.push({ kind: "CUSTODY_GAP", reference: book.id, href: "/outage-receipts", detail: `${book.code}: no recovered signed handover by cutoff; unused status is not assumed` });
    for (const h of history) {
      if (h.outstanding.toLowerCase() !== "none") items.push({ kind: "CUSTODY_NOTE", reference: h.id, href: "/outage-receipts", detail: `${book.code}: ${h.outstanding}; held ${h.cashHeld}, transferred ${h.cashTransferred} centavos; actual ${h.actualAt.toISOString()}, entered ${h.enteredAt.toISOString()}` });
    }
    if (latest) {
      const counts = latest.counts as { used: number[]; void: number[]; missing: number[] };
      for (const n of counts.used.filter(n => !entries.some(e => e.bookId === book.id && e.number === n))) items.push({ kind: "UNENTERED_RECEIPT", reference: `${book.id}:${n}`, href: "/outage-receipts", detail: `${book.code}-${n}: physically used, not entered; amount unknown` });
      for (const kind of ["void", "missing"] as const) for (const n of counts[kind]) items.push({ kind: kind.toUpperCase(), reference: `${book.id}:${n}`, href: "/outage-receipts", detail: `${book.code}-${n}: ${kind}; no invented collection amount` });
    }
  }
  for (const e of outageEvents.filter(e => e.outcome === "OWNER_REVIEW")) items.push({ kind: "OUTAGE_EXCEPTION", reference: e.id, href: "/outage-receipts", detail: `${e.kind} ${e.number ?? ""}: ${e.outcome}` });
  for (const record of cases) {
    const latest = events.filter(e => e.caseId === record.id).sort((a,b) => a.revision-b.revision).at(-1);
    if (!latest || !["COMPLETED", "RECOVERED", "MATCHED"].includes(latest.outcome)) items.push({ kind: "INVESTIGATION", reference: record.id, href: `/investigations/${record.id}`, detail: `${record.reason}: ${latest?.outcome ?? "OPEN"}; ${record.summary}` });
  }
  for (const flag of flags) items.push({ kind: "PAYMENT_FLAG", reference: flag.id, href: "/investigations", detail: `${flag.paymentId}: ${flag.reason}` });
  const changes = events.filter(e => ["APPROVE_RECOVERY", "RECOVER", "REQUEST", "REVIEW", "EXECUTE_APPROVED", "SETTLE"].includes(e.kind)).map(e => {
    const execution = events.find(x => x.id === e.executionEventId);
    const payment = payments.find(p => p.id === (e.paymentId ?? execution?.paymentId));
    const record = cases.find(c => c.id === e.caseId);
    return { id: e.id, kind: e.kind, outcome: e.outcome, caseId: e.caseId, paymentId: payment?.id ?? null,
      collectedAt: payment?.collectedAt ?? record?.originalCollectedAt ?? null, enteredAt: payment?.enteredAt ?? null,
      verifiedAt: payment?.verifiedAt ?? null, createdAt: e.createdAt, settledAt: e.settledAt, amountCentavos: e.amountCentavos,
      evidenceReference: e.evidenceReference, settlementReference: e.settlementReference, actorId: e.actorId, href: `/investigations/${e.caseId}` };
  }).filter(e => (e.collectedAt && today(e.collectedAt)) || today(e.createdAt) || (e.settledAt && today(e.settledAt)));
  for (const entry of entries) {
    const confirmation = confirmations.find(c => c.entryId === entry.id);
    const payment = payments.find(p => p.id === confirmation?.paymentId);
    if (today(entry.collectedAt) || today(entry.enteredAt) || (payment && today(payment.verifiedAt))) {
      changes.push({ id: entry.id, kind: payment ? "OUTAGE_VERIFIED" : "OUTAGE_ENTRY", outcome: payment ? "VERIFIED" : "PENDING", caseId: "",
        paymentId: payment?.id ?? null, collectedAt: entry.collectedAt, enteredAt: entry.enteredAt, verifiedAt: payment?.verifiedAt ?? null,
        createdAt: payment?.verifiedAt ?? entry.enteredAt, settledAt: null, amountCentavos: entry.amountCentavos,
        evidenceReference: confirmation?.receiptEvidence ?? entry.receiptReference, settlementReference: null, actorId: payment?.verifiedBy ?? entry.enteredBy, href: "/outage-receipts" });
    }
  }
  const collections = payments.filter(p => today(p.collectedAt)).map(p => ({ id: p.id, collectedBy: p.collectedBy, method: p.method, amountCentavos: p.amountCentavos,
    collectedAt: p.collectedAt, enteredAt: p.enteredAt, verifiedAt: p.verifiedAt, receiptId: p.receipt?.id ?? null, excluded: excluded.has(p.id) }));
  const source = { day, start: start.toISOString(), end: end.toISOString(), rows: [...rows.values()].sort((a,b) => `${a.collectorId}:${a.method}`.localeCompare(`${b.collectorId}:${b.method}`)), items, collections, changes, refundMovements };
  // Hash all contributing immutable facts, including evidence changes that leave totals equal.
  const sourceHash = hash({ source, payments, claims, settlements, accounts, books, entries, confirmations, handovers, outageEvents, cases, events, flags });
  return { ...source, sourceHash, accounts, investigations: cases.map(c => ({ id: c.id, reason: c.reason, summary: c.summary })) };
}

export async function closingOverview(headers: Headers, input: unknown) {
  const parsed = closingDaySchema.safeParse(input);
  if (!parsed.success) reject(400, "Choose a valid business date.");
  return inGym(headers, "CLOSING", async (tx, actor) => {
    const source = await sourceFor(tx, parsed.data!);
    const snapshots = await tx.closingSnapshot.findMany({ where: { day: parsed.data! }, orderBy: { revision: "asc" } });
    const ids = snapshots.map(s => s.id);
    const lines = await tx.closingLine.findMany({ where: { snapshotId: { in: ids } }, orderBy: { id: "asc" } });
    const approvals = await tx.closingApproval.findMany({ where: { snapshotId: { in: ids } } });
    const checks = await tx.closingCheck.findMany({ where: { day: parsed.data! }, orderBy: { ordinal: "asc" } });
    const operators = await tx.operator.findMany({ select: { id: true, state: true, role: true, canCollectCash: true, user: { select: { name: true } } } });
    const grants = await tx.digitalVerifier.findMany({ where: { operatorId: actor.operator.id, active: true } });
    const links = await tx.closingLineCheck.findMany({ where: { lineId: { in: lines.map(l => l.id) } } });
    return { ...source, snapshots, lines, approvals, checks, links, operators, grants, owner: actor.operator.role === "OWNER",
      canPrepare: actor.operator.role === "OWNER" || actor.operator.canCollectCash, operatorId: actor.operator.id,
      recoveryScope: `${actor.operator.gymId}:${actor.operator.id}`, ended: closingBounds(parsed.data!).end <= new Date() };
  }, true);
}

export async function closingCommand(headers: Headers, input: unknown, key: unknown) {
  const parsed = closingCommandSchema.safeParse(input); const parsedKey = closingKeySchema.safeParse(key);
  if (!parsed.success || !parsedKey.success) reject(400, "Check the closing fields and operation key.");
  const command = parsed.data!; const operationKey = parsedKey.data!;
  const fingerprint = hash(command);
  return inGym(headers, "CLOSING", async (tx, actor) => {
    const gymId = actor.operator.gymId;
    if (command.action === "submit") authorize(actor.operator, "CASH");
    if (command.action === "approve") authorize(actor.operator, "OWNER");
    if (command.action === "count" && command.method === "CASH") authorize(actor.operator, "CASH");
    // Read committed result before mutable source/grant/freshness checks, with current role enforced.
    const matches = [
      await tx.closingCheck.findUnique({ where: { gymId_operationKey: { gymId, operationKey } } }),
      await tx.closingSnapshot.findUnique({ where: { gymId_operationKey: { gymId, operationKey } } }),
      await tx.closingApproval.findUnique({ where: { gymId_operationKey: { gymId, operationKey } } }),
    ];
    const committed = matches.find(Boolean);
    if (committed) {
      if (committed.fingerprint !== fingerprint) reject(409, "This operation key belongs to different closing details. Retrieve its original result.");
      return committed;
    }
    if (command.action === "approve") await ownerInTransaction(tx, actor);
    const snapshot = command.action === "approve" ? await tx.closingSnapshot.findUnique({ where: { id: command.snapshotId } }) : null;
    if (command.action === "approve" && !snapshot) reject(404, "Closing snapshot unavailable.");
    const day = command.action === "approve" ? snapshot!.day : command.day;
    const source = await sourceFor(tx, day);
    if (command.sourceHash !== source.sourceHash) reject(409, "Closing evidence changed. Reload, review later events and explicitly submit new or reaffirmed counts.");
    if (command.action === "count") {
      if (!await tx.operator.findUnique({ where: { id: command.collectorId } })) reject(404, "Collector unavailable in this gym.");
      if (command.caseId && !await tx.investigationCase.findUnique({ where: { id: command.caseId } })) reject(404, "Linked investigation unavailable in this gym.");
      const grossActual = cents(command.amount); const cashHeld = cents(command.cashHeld); const transferred = cents(command.transferred); const paidFromBatch = cents(command.paidFromBatch);
      if (command.method === "CASH") {
        if (command.accountId || grossActual !== bounded(cashHeld + transferred + paidFromBatch)) reject(400, "Cash gross must equal held cash plus evidenced transfers and payouts from this day's segregated batch.");
        if (paidFromBatch > source.refundMovements.filter(r => r.actualMethod === "CASH").reduce((sum,r) => sum+r.amountCentavos,0)) reject(400, "Batch payouts require actual owner-verified cash refund settlements on this day. Approval alone is insufficient.");
      } else {
        if (cashHeld || transferred || paidFromBatch || !command.accountId) reject(400, "Digital actuals need a receiving account and zero cash components.");
        const account = await tx.receivingAccount.findUnique({ where: { id: command.accountId } });
        const grant = await tx.digitalVerifier.findUnique({ where: { accountId_operatorId: { accountId: command.accountId, operatorId: actor.operator.id } } });
        if (!account || account.method !== command.method || !grant?.active) reject(403, "A designated viewer of this receiving account must independently check digital actuals.");
      }
      const result = await tx.closingCheck.create({ data: { gymId, day, sourceHash: source.sourceHash, collectorId: command.collectorId, method: command.method,
        accountId: command.accountId, caseId: command.caseId, grossActual, cashHeld, transferred, paidFromBatch, evidenceReference: command.evidenceReference, notes: command.notes,
        checkedBy: actor.operator.id, operationKey, fingerprint } });
      await tx.identityAudit.create({ data: { gymId, initiatorId: actor.operator.userId, subjectId: result.id, action: "CLOSING_ACTUAL_CHECKED" } });
      return result;
    }
    const latest = await tx.closingSnapshot.findFirst({ where: { day }, orderBy: { revision: "desc" } });
    if (command.action === "approve") {
      if (latest?.id !== snapshot!.id || snapshot!.sourceHash !== source.sourceHash) reject(409, "Snapshot is stale. Review a linked supplemental closing before approval.");
      const lines = await tx.closingLine.findMany({ where: { snapshotId: snapshot!.id } });
      const links = await tx.closingLineCheck.findMany({ where: { lineId: { in: lines.map(l => l.id) } } });
      const capturedIds = new Set(links.map(l => l.checkId));
      const currentChecks = await latestChecks(tx,day);
      if (currentChecks.length !== capturedIds.size || currentChecks.some(c => !capturedIds.has(c.id))) reject(409, "Actual evidence was added or replaced after submission. Review a linked supplement before approval.");
      if (await tx.closingApproval.findUnique({ where: { snapshotId: snapshot!.id } })) reject(409, "This snapshot already has an owner approval. Retrieve it.");
      const result = await tx.closingApproval.create({ data: { gymId, snapshotId: snapshot!.id, sourceHash: source.sourceHash, approvedBy: actor.operator.id,
        evidenceReference: command.evidenceReference, notes: command.notes, operationKey, fingerprint } });
      await tx.identityAudit.create({ data: { gymId, initiatorId: actor.operator.userId, subjectId: result.id, action: "CLOSING_UNRESOLVED_ACKNOWLEDGED" } });
      return result;
    }
    if (closingBounds(day).end > new Date()) reject(409, "This business day has not ended. Use the preview until the next Manila midnight.");
    if ((latest?.id ?? null) !== command.previousId) reject(409, "Closing changed. Reload and explicitly link the latest snapshot for a supplement.");
    if (new Set(command.checkIds).size !== command.checkIds.length) reject(400, "Each actual evidence check must appear once.");
    const checks = await tx.closingCheck.findMany({ where: { id: { in: command.checkIds } }, orderBy: { id: "asc" } });
    if (checks.length !== command.checkIds.length || checks.some(c => c.day !== day || c.sourceHash !== source.sourceHash)) reject(409, "Actual evidence is missing, belongs to another day, or is stale. Recheck or explicitly reaffirm it.");
    const currentChecks = await latestChecks(tx,day);
    if (currentChecks.length !== checks.length || currentChecks.some(c => !command.checkIds.includes(c.id))) reject(409, "Review every latest independent actual check, including unrecorded collectors. Recheck stale evidence; no reported actual can be silently omitted.");
    const rows = new Map(source.rows.map(r => [`${r.collectorId}:${r.method}`, r]));
    for (const check of checks) if (!rows.has(`${check.collectorId}:${check.method}`)) rows.set(`${check.collectorId}:${check.method}`, { collectorId: check.collectorId, method: check.method, recorded: 0, excluded: 0, refunds: 0 });
    const prepared = [];
    if (checks.filter(c => c.method === "CASH").reduce((sum,c) => sum+c.paidFromBatch,0) > source.refundMovements.filter(r => r.actualMethod === "CASH").reduce((sum,r) => sum+r.amountCentavos,0)) reject(409, "Cash batch payout portions exceed evidenced settled refunds. Review allocation without counting a payout twice.");
    for (const row of rows.values()) {
      const actuals = checks.filter(c => c.collectorId === row.collectorId && c.method === row.method);
      const expectedAccounts = row.method === "CASH" ? [null] : source.accounts.filter(a => a.method === row.method).map(a => a.id);
      if (!expectedAccounts.length || actuals.length !== expectedAccounts.length || expectedAccounts.some(id => actuals.filter(c => c.accountId === id).length !== 1)) reject(409, "Every collector/method needs an explicit count; digital actuals must cover every receiving account of that method.");
      // A revoked/offboarded viewer's old unsubmitted attestation cannot authorize a new close.
      for (const check of actuals.filter(c => c.accountId)) {
        const grant = await tx.digitalVerifier.findUnique({ where: { accountId_operatorId: { accountId: check.accountId!, operatorId: check.checkedBy } } });
        const viewer = await tx.operator.findUnique({ where: { id: check.checkedBy } });
        if (!grant?.active || viewer?.state !== "ACTIVE") reject(403, "Digital evidence viewer is unavailable. Obtain a current designated viewer check.");
      }
      const grossActual = bounded(actuals.reduce((sum,c) => sum+c.grossActual,0));
      prepared.push({ row, actuals, grossActual, difference: bounded(grossActual-row.recorded+row.excluded) });
    }
    const result = await tx.closingSnapshot.create({ data: { gymId, day, revision: (latest?.revision ?? 0)+1, previousId: latest?.id ?? null,
      sourceHash: source.sourceHash, source: json(source), evidenceReference: command.evidenceReference, notes: command.notes,
      submittedBy: actor.operator.id, operationKey, fingerprint } });
    for (const { row, actuals, grossActual, difference } of prepared) {
      const line = await tx.closingLine.create({ data: { gymId, snapshotId: result.id, ...row, grossActual, difference } });
      await tx.closingLineCheck.createMany({ data: actuals.map(c => ({ gymId, lineId: line.id, checkId: c.id })) });
    }
    await tx.identityAudit.create({ data: { gymId, initiatorId: actor.operator.userId, subjectId: result.id, action: latest ? "CLOSING_SUPPLEMENT_SUBMITTED" : "CLOSING_SUBMITTED" } });
    return result;
  }, true);
}
