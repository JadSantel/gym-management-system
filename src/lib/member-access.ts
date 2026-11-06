import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { auth } from "./auth";
import { db } from "./db";
import { memberBinding, setGymContext } from "./binding";
import { inGym } from "./tenant";
import { IdentityError } from "./identity";
import { identitySchemas, identityFieldErrors } from "./identity-schema";
import { recordIdSchema } from "./route-schema";
import { assessEligibility } from "./eligibility";
import { assertSynthetic, localEmail, type EmailSender } from "./email";

export const memberAccessCommand = z.strictObject({ action: z.enum(["invite", "reset"]) });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const unavailable = () => new IdentityError(400, "Link expired, replaced, or already used. Ask reception for a new member setup link.");

export async function memberAccess(headers: Headers, memberId: unknown) {
  const id = recordIdSchema.safeParse(memberId);
  if (!id.success) throw new IdentityError(400, "Invalid member reference.");
  return inGym(headers, "MEMBERS", async tx => {
    if (!await tx.member.findUnique({ where: { id: id.data } })) throw new IdentityError(404, "Member unavailable.");
    const account = await tx.memberAccount.findUnique({ where: { memberId: id.data }, include: { user: true } });
    return account ? { state: account.state, email: account.user.email } : null;
  });
}

async function deliverMemberLink(issued: { id: string; gymId: string; token: string; email: string; purpose: string }, sender: EmailSender) {
  const url = new URL("/member/setup", assertSynthetic().BETTER_AUTH_URL);
  url.hash = issued.token;
  try {
    await sender.send({ id: issued.id, to: issued.email, purpose: `MEMBER_${issued.purpose}`, url: url.href });
    await db.$transaction(async tx => {
      await setGymContext(tx, issued.gymId);
      await tx.memberInvitation.update({ where: { id: issued.id }, data: { sentAt: new Date() } });
    });
    return { status: "Member email link captured locally. Live email delivery is not enabled." };
  } catch {
    return { status: "Member email delivery is not confirmed. Ask reception to issue a new link; live email is not enabled." };
  }
}

async function issueLink(tx: Prisma.TransactionClient, account: { id: string; gymId: string; userId: string }, purpose: "SETUP" | "RESET", email: string, initiatorId: string) {
  const token = randomBytes(32).toString("hex");
  await tx.memberInvitation.updateMany({ where: { accountId: account.id, consumedAt: null }, data: { consumedAt: new Date() } });
  const invitation = await tx.memberInvitation.create({ data: { gymId: account.gymId, accountId: account.id, purpose, tokenHash: hash(token), expiresAt: new Date(Date.now() + (purpose === "RESET" ? 30 * 60_000 : 48 * 3600_000)) } });
  await tx.identityAudit.create({ data: { gymId: account.gymId, initiatorId, subjectId: account.userId, action: `MEMBER_${purpose}_ISSUED` } });
  return { id: invitation.id, gymId: account.gymId, token, email, purpose };
}

export async function issueMemberAccess(headers: Headers, reference: unknown, input: unknown, sender: EmailSender = localEmail) {
  assertSynthetic();
  const id = recordIdSchema.safeParse(reference), command = memberAccessCommand.safeParse(input);
  if (!id.success || !command.success) throw new IdentityError(400, "Invalid member account action.");
  const issued = await inGym(headers, "MEMBERS", async (tx, actor) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM members WHERE id=${id.data}::uuid FOR UPDATE`;
    if (!rows.length) throw new IdentityError(404, "Member unavailable.");
    const member = await tx.member.findUniqueOrThrow({ where: { id: id.data } });
    let account = await tx.memberAccount.findUnique({ where: { memberId: member.id }, include: { user: true } });
    if (command.data.action === "invite") {
      const access = assessEligibility(await tx.effectiveEntitlement.findMany({ where: { memberId: member.id, isCurrentProjection: true } }), new Date());
      if (access.status !== "ELIGIBLE" || !member.email) throw new IdentityError(409, "Activate the paid membership and record an email before sending member setup.");
      if (account && account.state !== "PENDING") throw new IdentityError(409, "Member login already exists. Reload the profile to send a password reset instead.");
      if (!account) {
        if (await tx.user.findUnique({ where: { email: member.email } })) throw new IdentityError(409, "Member login cannot be created with these account details. Reception must review them.");
        const user = await tx.user.create({ data: { id: randomUUID(), name: member.fullName, email: member.email } });
        account = await tx.memberAccount.create({ data: { gymId: actor.operator.gymId, memberId: member.id, userId: user.id }, include: { user: true } });
      }
    } else if (!account || account.state !== "ACTIVE") throw new IdentityError(409, "An active member login is required for password recovery.");
    return issueLink(tx, account!, command.data.action === "invite" ? "SETUP" : "RESET", account!.user.email, actor.operator.userId);
  });
  return deliverMemberLink(issued, sender);
}

export async function completeMemberSetup(input: unknown) {
  assertSynthetic();
  const parsed = identitySchemas.setup.safeParse(input);
  if (!parsed.success) throw new IdentityError(400, "Check the password fields and member setup link.", identityFieldErrors(parsed.error));
  const password = await (await auth.$context).password.hash(parsed.data.password);
  await db.$transaction(async tx => {
    const [scope] = await tx.$queryRaw<{ gymId: string | null }[]>`SELECT public.member_setup_scope(${hash(parsed.data.token)}) AS "gymId"`;
    if (!scope.gymId) throw unavailable();
    await setGymContext(tx, scope.gymId);
    await tx.$queryRaw`SELECT id FROM gyms WHERE id=${scope.gymId}::uuid FOR UPDATE`;
    const invitation = await tx.memberInvitation.findUnique({ where: { tokenHash: hash(parsed.data.token) }, include: { account: { include: { user: true, member: { include: { gym: true } } } } } });
    if (!invitation || invitation.consumedAt || !invitation.sentAt || invitation.expiresAt <= new Date()) throw unavailable();
    const account = invitation.account;
    if (account.member.gym.state !== "ACTIVE" || account.state !== (invitation.purpose === "RESET" ? "ACTIVE" : "PENDING")) throw unavailable();
    await tx.memberInvitation.update({ where: { id: invitation.id }, data: { consumedAt: new Date() } });
    await tx.account.upsert({ where: { id: `credential:${account.userId}` }, create: { id: `credential:${account.userId}`, accountId: account.userId, providerId: "credential", userId: account.userId, password }, update: { password } });
    await tx.user.update({ where: { id: account.userId }, data: { emailVerified: true } });
    await tx.memberAccount.update({ where: { id: account.id }, data: { state: "ACTIVE" } });
    await tx.session.deleteMany({ where: { userId: account.userId } });
    await tx.identityAudit.create({ data: { gymId: account.gymId, initiatorId: account.userId, subjectId: account.userId, action: `MEMBER_${invitation.purpose}_COMPLETED` } });
  });
  return { status: "Member password is ready." };
}

export async function recoverMember(input: unknown, sender: EmailSender = localEmail) {
  assertSynthetic();
  const parsed = identitySchemas["reset-owner"].safeParse(input);
  if (!parsed.success) throw new IdentityError(400, "Check your email.", identityFieldErrors(parsed.error));
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const account = user ? await memberBinding(user.id) : null;
  if (account?.state === "ACTIVE" && account.gym.state === "ACTIVE") {
    const issued = await db.$transaction(async tx => {
      await setGymContext(tx, account.gymId);
      await tx.$queryRaw`SELECT id FROM gyms WHERE id=${account.gymId}::uuid FOR UPDATE`;
      const current = await tx.memberAccount.findUnique({ where: { id: account.id }, include: { member: { include: { gym: true } }, user: true } });
      if (!current || current.state !== "ACTIVE" || current.member.gym.state !== "ACTIVE") return null;
      return issueLink(tx, current, "RESET", current.user.email, current.userId);
    });
    if (issued) await deliverMemberLink(issued, sender);
  }
  return { status: "If a member account matches, its recovery link has been captured locally. You can also ask reception for help." };
}

export async function memberDashboard(headers: Headers, clock: () => Date = () => new Date()) {
  const session = await auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } });
  if (!session) throw new IdentityError(401, "Sign in to your member account.");
  const binding = await memberBinding(session.user.id);
  if (!binding || binding.state !== "ACTIVE" || binding.gym.state !== "ACTIVE") throw new IdentityError(403, "Member account access is unavailable.");
  return db.$transaction(async tx => {
    await setGymContext(tx, binding.gymId);
    await tx.$queryRaw`SELECT id FROM gyms WHERE id=${binding.gymId}::uuid FOR SHARE`;
    const account = await tx.memberAccount.findUnique({ where: { id: binding.id }, include: { user: true, member: { include: { gym: true } } } });
    const currentSession = await tx.session.findUnique({ where: { id: session.session.id } });
    if (!account || account.state !== "ACTIVE" || account.userId !== session.user.id || account.member.gym.state !== "ACTIVE" || !currentSession || currentSession.userId !== account.userId || currentSession.expiresAt <= new Date()) throw new IdentityError(403, "Member account access is unavailable.");
    const now = clock();
    const access = assessEligibility(await tx.effectiveEntitlement.findMany({ where: { memberId: account.memberId, isCurrentProjection: true } }), now);
    const qr = access.status === "ELIGIBLE" ? await tx.memberQr.findFirst({ where: { memberId: account.memberId, revokedAt: null } }) : null;
    const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });
    return { name: account.member.fullName, gym: account.member.gym.name, status: access.status, reason: access.reason,
      startsAt: access.interval?.startsAt.toISOString() ?? null, endsAt: access.interval?.endsAt.toISOString() ?? null, checkedAt: now.toISOString(),
      periodText: access.interval ? `${date.format(access.interval.startsAt)} to ${date.format(access.interval.endsAt)} PHT. Access ends at the stated expiry time.` : null,
      checkedText: `${date.format(now)} PHT`,
      qr: qr ? await QRCode.toDataURL(qr.code, { width: 400, margin: 4, errorCorrectionLevel: "M" }) : null };
  });
}
