import "server-only";
import { createHash, randomBytes } from "node:crypto";
import QRCode from "qrcode";
import type { Prisma } from "../generated/prisma/client";
import { inGym } from "./tenant";
import { IdentityError } from "./identity";
import { recordParamsSchema } from "./route-schema";
import { assessEligibility } from "./eligibility";
import { attendanceQuerySchema, correctionSchema, dayStart, manilaDay, qrCommandSchema, scanSchema, visitStatus } from "./attendance-schema";

type Clock = () => Date;
export type ScanResult = { status: "IN" | "OUT" | "SUPPRESSED" | "DENIED"; message: string; memberName?: string; visitId?: string; checkedAt: string };
async function operation(tx: Prisma.TransactionClient, gymId: string, requestId: string, input: unknown) {
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`attendance:${gymId}:${requestId}`},0))`;
  const previous = await tx.attendanceOperation.findUnique({ where: { gymId_requestId: { gymId, requestId } } });
  if (previous && previous.fingerprint !== fingerprint) throw new IdentityError(409, "This request ID already belongs to a different action. Reload before trying again.");
  return { fingerprint, previous };
}
async function memberLock(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM members WHERE id=${id}::uuid FOR UPDATE`;
  if (!rows.length) throw new IdentityError(404, "Member unavailable.");
}
async function retirePastOpen(tx: Prisma.TransactionClient, memberId: string, now: Date) {
  await tx.attendanceVisit.updateMany({ where: { memberId, isOpen: true, day: { lt: new Date(manilaDay(now)) } }, data: { isOpen: false } });
}
async function eligible(tx: Prisma.TransactionClient, memberId: string, now: Date) {
  return assessEligibility(await tx.effectiveEntitlement.findMany({ where: { memberId, isCurrentProjection: true } }), now).status === "ELIGIBLE";
}
function memberId(input: unknown) {
  const parsed = recordParamsSchema.safeParse({ id: input });
  if (!parsed.success) throw new IdentityError(400, "Invalid member reference.");
  return parsed.data.id;
}
export async function memberQr(headers: Headers, reference: unknown, input?: unknown, clock: Clock = () => new Date()) {
  const id = memberId(reference);
  const command = input === undefined ? null : qrCommandSchema.safeParse(input);
  if (command && !command.success) throw new IdentityError(400, "Invalid QR action.");
  const result = await inGym(headers, "MEMBERS", async (tx, actor) => {
    const gymId = actor.operator.gymId;
    const action = command?.success ? command.data : null;
    const op = action ? await operation(tx, gymId, action.requestId, { id, ...action }) : null;
    if (op?.previous) return op.previous.result as { code: string; memberName: string };
    await memberLock(tx, id);
    const member = await tx.member.findUniqueOrThrow({ where: { id } });
    let qr = await tx.memberQr.findFirst({ where: { memberId: id, revokedAt: null } });
    if (action && (!qr || action.action === "replace")) {
      const now = clock();
      if (!await eligible(tx, id, now)) throw new IdentityError(409, "Current verified membership is required to issue or replace a personal QR. No payment is needed for an already eligible member.");
      if (qr) await tx.memberQr.update({ where: { id: qr.id }, data: { revokedAt: now } });
      qr = await tx.memberQr.create({ data: { gymId, memberId: id, code: randomBytes(32).toString("base64url"), createdBy: actor.operator.id, createdAt: now } });
      await tx.identityAudit.create({ data: { gymId, initiatorId: actor.operator.userId, subjectId: id, action: action.action === "replace" ? "MEMBER_QR_REPLACED" : "MEMBER_QR_ISSUED" } });
    }
    const payload = qr ? { code: qr.code, memberName: member.fullName } : null;
    if (action && payload && op) await tx.attendanceOperation.create({ data: { gymId, memberId: id, requestId: action.requestId, fingerprint: op.fingerprint, result: payload } });
    return payload;
  });
  return result ? { ...result, png: await QRCode.toDataURL(result.code, { margin: 4, width: 400, errorCorrectionLevel: "M" }) } : null;
}

export async function scanAttendance(headers: Headers, input: unknown, clock: Clock = () => new Date()): Promise<ScanResult> {
  const parsed = scanSchema.safeParse(input);
  if (!parsed.success) throw new IdentityError(400, "Scan a valid personal QR and retry with a valid request ID.");
  return inGym(headers, "MEMBERS", async (tx, actor) => {
    const { code, requestId } = parsed.data, gymId = actor.operator.gymId;
    const op = await operation(tx, gymId, requestId, { action: "scan", ...parsed.data });
    if (op.previous) return op.previous.result as unknown as ScanResult;
    let qr = await tx.memberQr.findFirst({ where: { code, revokedAt: null } });
    if (qr) { await memberLock(tx, qr.memberId); qr = await tx.memberQr.findFirst({ where: { code, revokedAt: null } }); }
    const now = clock();
    let result: ScanResult = { status: "DENIED", message: "QR unavailable. Ask reception to review the member record.", checkedAt: now.toISOString() };
    if (qr) {
      const member = await tx.member.findUniqueOrThrow({ where: { id: qr.memberId } });
      await retirePastOpen(tx, member.id, now);
      const last = await tx.attendanceEvent.findFirst({ where: { memberId: member.id, kind: { in: ["IN", "OUT"] } }, orderBy: { createdAt: "desc" } });
      const open = await tx.attendanceVisit.findFirst({ where: { memberId: member.id, isOpen: true } });
      result = { ...result, memberName: member.fullName };
      if (last && now.getTime() - last.createdAt.getTime() < 8000) result = { ...result, status: "SUPPRESSED", message: "Repeated scan ignored. Wait eight seconds after the last accepted scan.", visitId: last.visitId };
      else if (!open && !await eligible(tx, member.id, now)) result.message = "No current verified membership. Check the member profile before admission.";
      else {
        const status = open ? "OUT" : "IN";
        const visit = open ? await tx.attendanceVisit.update({ where: { id: open.id }, data: { departedAt: now, isOpen: false, revision: { increment: 1 } } })
          : await tx.attendanceVisit.create({ data: { gymId, memberId: member.id, arrivedAt: now, day: new Date(manilaDay(now)) } });
        await tx.attendanceEvent.create({ data: { gymId, memberId: member.id, visitId: visit.id, actorId: actor.operator.id, requestId,
          kind: status, revision: visit.revision, arrivedAt: visit.arrivedAt, departedAt: visit.departedAt, createdAt: now } });
        result = { ...result, status, message: status === "IN" ? "Check-in confirmed." : "Checkout confirmed.", visitId: visit.id };
      }
    }
    await tx.attendanceOperation.create({ data: { gymId, requestId, memberId: qr?.memberId, fingerprint: op.fingerprint, result: { ...result } } });
    return result;
  });
}

export async function correctVisit(headers: Headers, input: unknown, clock: Clock = () => new Date()) {
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) throw new IdentityError(400, "Enter valid times, the current revision and a correction reason.");
  try {
    return await inGym(headers, "MEMBERS", async (tx, actor) => {
      const data = parsed.data, gymId = actor.operator.gymId;
      const op = await operation(tx, gymId, data.requestId, data);
      if (op.previous) return op.previous.result;
      const original = await tx.attendanceVisit.findUnique({ where: { id: data.visitId } });
      if (!original) throw new IdentityError(404, "Visit unavailable.");
      await memberLock(tx, original.memberId);
      const current = await tx.attendanceVisit.findUniqueOrThrow({ where: { id: original.id } });
      if (current.revision !== data.revision || current.voided) throw new IdentityError(409, "Visit changed. Reload its history before correcting it.");
      const now = clock();
      const arrivedAt = data.action === "correct" ? data.arrivedAt : current.arrivedAt;
      const departedAt = data.action === "correct" ? data.departedAt : current.departedAt;
      if (arrivedAt > now || departedAt && (departedAt > now || departedAt <= arrivedAt)) throw new IdentityError(400, "Times cannot be future or reversed. Departure must follow arrival.");
      await retirePastOpen(tx, current.memberId, now);
      const visit = await tx.attendanceVisit.update({ where: { id: current.id }, data: { arrivedAt, departedAt, day: new Date(manilaDay(arrivedAt)),
        voided: data.action === "void", isOpen: data.action !== "void" && !departedAt && manilaDay(arrivedAt) === manilaDay(now), revision: { increment: 1 } } });
      await tx.attendanceEvent.create({ data: { gymId, memberId: current.memberId, visitId: visit.id, requestId: data.requestId, actorId: actor.operator.id,
        kind: data.action === "void" ? "VOID" : "CORRECT", revision: visit.revision, arrivedAt, departedAt, reason: data.reason, createdAt: now } });
      const result = { visitId: visit.id, revision: visit.revision, status: visitStatus(visit, now) };
      await tx.attendanceOperation.create({ data: { gymId, memberId: current.memberId, requestId: data.requestId, fingerprint: op.fingerprint, result } });
      return result;
    });
  } catch (error) {
    if (!(error instanceof IdentityError) && error instanceof Error && /exclusion constraint|23P01|unique constraint/i.test(error.message)) throw new IdentityError(409, "Correction overlaps another visit or open check-in. Reload the history and review both visits.");
    throw error;
  }
}

export async function attendanceHistory(headers: Headers, input: unknown, clock: Clock = () => new Date()) {
  const parsed = attendanceQuerySchema.safeParse(input);
  if (!parsed.success) throw new IdentityError(400, "Check the date range, member filter, view and page.");
  return inGym(headers, "MEMBERS", async tx => {
    const now = clock(), today = manilaDay(now), query = parsed.data;
    const from = query.from ?? today, to = query.to ?? today;
    if (from > to) throw new IdentityError(400, "The end date must follow the start date.");
    const names = await tx.member.findMany({ where: { fullName: { contains: query.member, mode: "insensitive" } }, select: { id: true, fullName: true } });
    const end = dayStart(to); end.setUTCDate(end.getUTCDate() + 1);
    const where: Prisma.AttendanceVisitWhereInput = { memberId: { in: names.map(row => row.id) }, arrivedAt: { gte: dayStart(from), lt: end },
      ...(query.view === "IN" ? { voided: false, departedAt: null, day: new Date(today) } : query.view === "MISSING" ? { voided: false, departedAt: null, day: { lt: new Date(today) } } : {}) };
    const count = await tx.attendanceVisit.count({ where }), pages = Math.max(1, Math.ceil(count / 20)), page = Math.min(query.page, pages);
    const rows = await tx.attendanceVisit.findMany({ where, orderBy: [{ arrivedAt: "desc" }, { id: "asc" }], take: 20, skip: (page - 1) * 20 });
    const events = await tx.attendanceEvent.findMany({ where: { visitId: { in: rows.map(row => row.id) } }, orderBy: [{ createdAt: "asc" }, { revision: "asc" }] });
    const actors = await tx.operator.findMany({ where: { id: { in: events.map(row => row.actorId) } }, select: { id: true, user: { select: { name: true } } } });
    return { from, to, member: query.member, view: query.view, page, pages, count, checkedAt: now.toISOString(), visits: rows.map(row => ({
      id: row.id, memberId: row.memberId, memberName: names.find(name => name.id === row.memberId)!.fullName, revision: row.revision, voided: row.voided,
      arrivedAt: row.arrivedAt.toISOString(), departedAt: row.departedAt?.toISOString() ?? null, status: visitStatus(row, now),
      events: events.filter(event => event.visitId === row.id).map(event => ({ kind: event.kind, revision: event.revision, reason: event.reason,
        arrivedAt: event.arrivedAt.toISOString(), departedAt: event.departedAt?.toISOString() ?? null, recordedAt: event.createdAt.toISOString(), actor: actors.find(actor => actor.id === event.actorId)!.user.name })),
    })) };
  });
}
