import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { assertSynthetic, type EmailSender } from "../src/lib/email";
import { completeSetup, getActor } from "../src/lib/identity";
import { bootstrapSyntheticPlatformAdmin } from "../src/lib/onboarding";
import { POST as submitRequest } from "../src/app/api/onboarding-requests/route";
import { GET as getRequests, POST as decideRequest } from "../src/app/api/platform/onboarding/route";
import { POST as retryInvitation } from "../src/app/api/platform/onboarding/retry/route";

assertSynthetic();
const adminDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
const password = "Synthetic platform secret 2026!";
const prefix = randomUUID().slice(0, 8);
const platformEmail = `platform-${prefix}@example.test`;
const ownerEmail = `owner-${prefix}@example.test`;
const failedSender: EmailSender = { async send() { throw new Error("Synthetic delivery unavailable"); } };

function req(url: string, method: string, body?: unknown, cookie?: string) {
  return new Request(`http://127.0.0.1:3000${url}`, { method,
    headers: { origin: "http://127.0.0.1:3000", ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function signIn(email: string) {
  await adminDb.rateLimit.deleteMany();
  const response = await auth.handler(req("/api/auth/sign-in/email", "POST", { email, password }));
  assert.equal(response.status, 200);
  const cookies = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  assert.ok(cookies);
  return { cookie: cookies, headers: new Headers({ cookie: cookies }) };
}

async function json(response: Response) { return response.json(); }

after(async () => { await db.$disconnect(); await adminDb.$disconnect(); });

test("synthetic gym onboarding request, private review, and owner setup", async () => {
  await adminDb.rateLimit.deleteMany({ where: { key: { startsWith: "identity:onboarding-request:" } } });
  await bootstrapSyntheticPlatformAdmin(platformEmail, "Synthetic Reviewer", password, adminDb);
  assert.equal(await adminDb.operator.count({ where: { user: { email: platformEmail } } }), 0);
  assert.equal(await adminDb.memberAccount.count({ where: { user: { email: platformEmail } } }), 0);
  const platform = await signIn(platformEmail);

  const requestBody = { gymName: ` Synthetic Queue Gym ${prefix} `, ownerName: "Synthetic Owner", email: ownerEmail };
  const first = await submitRequest(req("/api/onboarding-requests", "POST", requestBody));
  assert.equal(first.status, 200);
  assert.match((await json(first)).status, /received/);
  const duplicate = await submitRequest(req("/api/onboarding-requests", "POST", requestBody));
  assert.equal(duplicate.status, 200);
  assert.equal(await adminDb.onboardingRequest.count({ where: { normalizedEmail: ownerEmail } }), 1);
  assert.equal(await adminDb.gym.count({ where: { name: { contains: `Synthetic Queue Gym ${prefix}` } } }), 0);
  for (let i = 0; i < 3; i++) assert.equal((await submitRequest(req("/api/onboarding-requests", "POST", requestBody))).status, 200);
  const limited = await submitRequest(req("/api/onboarding-requests", "POST", { gymName: "Rate limited", ownerName: "Synthetic", email: `limit-${prefix}@example.test` }));
  assert.equal(limited.status, 429);

  const anonymous = await getRequests(req("/api/platform/onboarding", "GET"));
  assert.equal(anonymous.status, 401);
  const listed = await getRequests(req("/api/platform/onboarding", "GET", undefined, platform.cookie));
  assert.equal(listed.status, 200);
  const items = await json(listed) as { id: string; email: string; state: string }[];
  const item = items.find(value => value.email === ownerEmail);
  assert.ok(item);
  assert.equal(item.state, "PENDING");
  const requestId = item.id;

  const unconfirmed = await decideRequest(req("/api/platform/onboarding", "POST", { requestId, decision: "APPROVE", syntheticOwnershipVerified: false }, platform.cookie));
  assert.equal(unconfirmed.status, 400);
  const rejectedApproval = await decideRequest(req("/api/platform/onboarding", "POST", { requestId, decision: "APPROVE", syntheticOwnershipVerified: true }, platform.cookie));
  assert.equal(rejectedApproval.status, 200);
  assert.deepEqual(await json(rejectedApproval), { status: "APPROVED", invitation: "captured" });
  const provisioned = await adminDb.onboardingRequest.findUniqueOrThrow({ where: { id: requestId }, include: { provisionedGym: { include: { operators: { include: { user: true, invitations: true } } } } } });
  assert.equal(provisioned.provisionedGym?.state, "PENDING");
  assert.equal(provisioned.provisionedGym?.operators[0].state, "PENDING");
  assert.equal(provisioned.provisionedGym?.operators[0].user.email, ownerEmail);
  assert.equal(provisioned.provisionedGym?.operators[0].invitations.length, 1);

  // Lost-response retry returns the existing decision and does not rotate the live link.
  const approvedAgain = await decideRequest(req("/api/platform/onboarding", "POST", { requestId, decision: "APPROVE", syntheticOwnershipVerified: true }, platform.cookie));
  assert.deepEqual(await json(approvedAgain), { status: "APPROVED" });
  assert.equal(await adminDb.invitation.count({ where: { operatorId: provisioned.provisionedGym!.operators[0].id } }), 1);

  const ownerInvitation = provisioned.provisionedGym!.operators[0].invitations[0];
  const mailbox = resolve(".local/mailbox", `${ownerInvitation.id}.json`);
  const capturedInvite = JSON.parse(await readFile(mailbox, "utf8")) as { url: string };
  const token = new URL(capturedInvite.url).hash.slice(1);
  await unlink(mailbox);
  await completeSetup(token, password);
  const owner = await signIn(ownerEmail);
  const actor = await getActor(owner.headers);
  assert.equal(actor.operator.gymId, provisioned.provisionedGymId);
  assert.equal(actor.operator.role, "OWNER");
  assert.equal((await getRequests(req("/api/platform/onboarding", "GET", undefined, owner.cookie))).status, 403);
  assert.equal((await decideRequest(req("/api/platform/onboarding", "POST", { requestId, decision: "DECLINE", syntheticOwnershipVerified: false }, owner.cookie))).status, 403);

  const denied = await submitRequest(req("/api/onboarding-requests", "POST", { ...requestBody, email: `bad-${prefix}@example.com` }));
  assert.equal(denied.status, 400);

  const failedBody = { gymName: `Synthetic Retry Gym ${prefix}`, ownerName: "Retry Owner", email: `retry-${prefix}@example.test` };
  await submitRequest(req("/api/onboarding-requests", "POST", failedBody));
  const failedId = await adminDb.onboardingRequest.findFirstOrThrow({ where: { normalizedEmail: failedBody.email } });
  const failedApproval = await (await import("../src/lib/onboarding")).decideOnboardingRequest(platform.headers, {
    requestId: failedId.id, decision: "APPROVE", syntheticOwnershipVerified: true,
  }, failedSender);
  assert.equal(failedApproval.invitation, "pending");
  const pendingOwner = await adminDb.operator.findFirstOrThrow({ where: { gym: { onboardingRequest: { id: failedId.id } }, role: "OWNER" } });
  const invitationBeforeRetry = await adminDb.invitation.findFirstOrThrow({ where: { operatorId: pendingOwner.id } });
  assert.equal(invitationBeforeRetry.sentAt, null);
  const retried = await retryInvitation(req("/api/platform/onboarding/retry", "POST", { requestId: failedId.id }, platform.cookie));
  assert.deepEqual(await json(retried), { status: "captured" });
  const invitations = await adminDb.invitation.findMany({ where: { operatorId: pendingOwner.id }, orderBy: { createdAt: "asc" } });
  assert.equal(invitations.length, 2);
  assert.ok(invitations[0].consumedAt);
  assert.ok(invitations[1].sentAt);

  const declineBody = { gymName: `Synthetic Decline Gym ${prefix}`, ownerName: "Declined Owner", email: `decline-${prefix}@example.test` };
  await submitRequest(req("/api/onboarding-requests", "POST", declineBody));
  const declineRecord = await adminDb.onboardingRequest.findFirstOrThrow({ where: { normalizedEmail: declineBody.email } });
  const declined = await decideRequest(req("/api/platform/onboarding", "POST", { requestId: declineRecord.id, decision: "DECLINE", syntheticOwnershipVerified: false }, platform.cookie));
  assert.equal(declined.status, 200);
  assert.deepEqual(await json(declined), { status: "DECLINED" });
  assert.equal(await adminDb.operator.count({ where: { user: { email: declineBody.email } } }), 0);
  assert.ok(await adminDb.platformAuditEvent.findFirst({ where: { onboardingRequestId: declineRecord.id, action: "ONBOARDING_REQUEST_DECLINED" } }));

  await assert.rejects(db.$queryRaw`SELECT public.create_platform_pending_gym('Untrusted direct insert')`);

  // Platform requests are invisible to the runtime role without an explicit platform context.
  assert.equal(await db.onboardingRequest.count(), 0);
});
