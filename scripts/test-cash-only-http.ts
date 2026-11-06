import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { assertSynthetic, type EmailSender } from "../src/lib/email";
import { bootstrapSyntheticOwner, completeSetup, reauthenticate } from "../src/lib/identity";
import { createMember } from "../src/lib/members";
import { changePlans } from "../src/lib/plans";
import { confirmCash, prepareCharge } from "../src/lib/charges";
import { paymentHistory } from "../src/lib/payment-history";

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/gym_crm_synthetic");
}
const origin = process.env.BETTER_AUTH_URL!;
assert.equal(origin, "http://127.0.0.1:3000");
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }) });
const suffix = randomUUID().slice(0, 8);
const email = `cash-http-${suffix}@example.test`;
const password = "Synthetic cash history password 2026!";
let token = "";
const sender: EmailSender = { async send(message) { token = new URL(message.url).hash.slice(1); } };

try {
  const gymId = randomUUID();
  await bootstrapSyntheticOwner({ gymId, gymName: "Synthetic Cash History", name: "Cash HTTP Owner", email }, sender, admin);
  await completeSetup(token, password);
  const signIn = await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, {
    method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ email, password }),
  }));
  assert.equal(signIn.status, 200);
  const owner = new Headers({ cookie: signIn.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ") });
  await reauthenticate(owner, password);
  const plans = await changePlans(owner, { action: "initialize" });
  const plan = plans.find(item => item.durationDays === 30)!;
  const member = await createMember(owner, { fullName: `Cash History ${suffix}` });
  const charge = await prepareCharge(owner, member.id, plan.id);
  const confirmed = await confirmCash(owner, charge.id, "800.00", randomUUID());
  const receipt = await admin.paymentReceipt.findUniqueOrThrow({ where: { paymentId: confirmed.payment.id } });

  // Seed a matched synthetic legacy payment directly to prove retained records remain readable.
  const operator = await admin.operator.findFirstOrThrow({ where: { gymId, role: "OWNER" } });
  async function seedHistorical(method: "GCASH" | "BANK") {
  const prefix = method === "GCASH" ? "HISTORICAL" : "HISTORICAL-BANK";
  const historicalMember = await createMember(owner, { fullName: `Historical ${method === "GCASH" ? "Digital" : "Bank"} ${suffix}` });
  const historicalCharge = await prepareCharge(owner, historicalMember.id, plan.id);
  const account = await admin.receivingAccount.create({ data: { gymId, label: `${prefix} account ${suffix}`, method, createdBy: operator.id } });
  await admin.digitalVerifier.create({ data: { gymId, accountId: account.id, operatorId: operator.id, active: true } });
  const collectedAt = new Date();
  const enteredAt = new Date();
  const verifiedAt = new Date();
  const historicalReceipt = await admin.$transaction(async tx => {
    const claim = await tx.digitalClaim.create({ data: { gymId, chargeId: historicalCharge.id, accountId: account.id,
      amountCentavos: plan.priceCentavos, transactionReference: `HISTORICAL-${suffix}`, reportedReceivedAt: collectedAt,
      enteredAt, collectedBy: operator.id } });
    const payment = await tx.payment.create({ data: { gymId, memberId: historicalMember.id, chargeId: historicalCharge.id,
      reference: `${prefix}-PAYMENT-${suffix}`, amountCentavos: plan.priceCentavos, method,
      collectedBy: operator.id, collectedAt, enteredAt, verifiedBy: operator.id, verifiedAt } });
    await tx.membershipPeriod.create({ data: { gymId, memberId: historicalMember.id, paymentId: payment.id, confirmedBy: operator.id,
      startsAt: historicalCharge.intendedStart, endsAt: historicalCharge.intendedEnd } });
    await tx.effectiveEntitlement.create({ data: { gymId, memberId: historicalMember.id, periodId: (await tx.membershipPeriod.findUniqueOrThrow({ where: { paymentId: payment.id } })).id,
      startsAt: historicalCharge.intendedStart, endsAt: historicalCharge.intendedEnd } });
    const historicalReceipt = await tx.paymentReceipt.create({ data: { gymId, paymentId: payment.id, reference: `${prefix}-RECEIPT-${suffix}` } });
    await tx.digitalSettlement.create({ data: { gymId, claimId: claim.id, paymentId: payment.id, evidenceReference: `SYNTHETIC-${suffix}`, accountMatched: true } });
    return historicalReceipt;
  });
  return { member: historicalMember, receipt: historicalReceipt };
  }
  const { member: historicalMember, receipt: historicalReceipt } = await seedHistorical("GCASH");
  const bank = await seedHistorical("BANK");
  const bankRecords = await paymentHistory(owner, { method: "BANK" });
  assert.equal(bankRecords.payments.length, 1);
  assert.equal(bankRecords.payments[0].memberId, bank.member.id);
  assert.deepEqual(bankRecords.summary.bank, { amount: 80_000, count: 1 });
  assert.deepEqual(bankRecords.summary.cash, { amount: 80_000, count: 1 });
  assert.equal(bankRecords.summary.amount, 240_000, "all methods, including GCash, count in confirmed revenue");
  assert.equal(bankRecords.summary.count, 3);

  async function get(path: string) {
    return fetch(new URL(path, origin), { headers: owner });
  }
  const directoryResponse = await get("/members");
  assert.equal(directoryResponse.status, 200);
  const directoryHtml = await directoryResponse.text();
  assert.ok(directoryHtml.includes("Find a member"), "Members includes the operational lookup");
  assert.ok(directoryHtml.includes(`Cash History ${suffix}`), "Members shows the paid member");
  assert.ok(directoryHtml.includes("Active"), "Members shows current eligibility");
  assert.ok(directoryHtml.includes("Add member"), "Members offers the registration dialog trigger");
  assert.ok(!directoryHtml.includes('id="member-name"'), "Creation form stays in the dialog instead of inline");
  assert.ok(!directoryHtml.includes('href="/operate"'), "Front Desk is absent from navigation");
  const compatibilityResponse = await fetch(new URL("/operate", origin), { headers: owner, redirect: "manual" });
  assert.equal(compatibilityResponse.status, 307, "Old Front Desk route remains a temporary compatibility redirect");
  assert.equal(new URL(compatibilityResponse.headers.get("location")!, origin).pathname, "/members");
  const followedResponse = await get("/operate");
  assert.equal(followedResponse.status, 200);
  assert.equal(new URL(followedResponse.url).pathname, "/members");
  const memberResponse = await get(`/members/${member.id}`);
  assert.equal(memberResponse.status, 200);
  const memberHtml = await memberResponse.text();
  assert.ok(memberHtml.includes(`Cash History ${suffix}`), "cash member page shows the member");
  assert.ok(memberHtml.includes("Eligible for normal admission"), "cash member page shows eligibility");
  assert.ok(memberHtml.includes("Payment history"), "cash member page shows payment history");
  assert.ok(memberHtml.includes(receipt.reference), "cash member page links its receipt");

  const historyResponse = await get(`/transactions?member=${encodeURIComponent(`Cash History ${suffix}`)}`);
  assert.equal(historyResponse.status, 200);
  const historyHtml = await historyResponse.text();
  assert.ok(historyHtml.includes("<h1>Payments</h1>"), "transaction page shows Payments");
  assert.ok(!/<th\b[^>]*>Reference<\/th>/.test(historyHtml), "Reference column is removed");
  assert.ok(historyHtml.includes('aria-label="Payment summary"'), "real payment summaries render");
  assert.ok(historyHtml.includes(confirmed.payment.reference), "transaction page shows the cash payment");
  assert.ok(historyHtml.includes(`/receipts/${receipt.id}`), "transaction page links the cash receipt");
  const pendingHistory = await (await get("/transactions?status=PENDING")).text();
  assert.ok(pendingHistory.includes("No pending payments in this history"));
  assert.ok(!pendingHistory.includes('data-label="Receipt"'), "pending view invents no receipt rows");
  const repeatedRange = await fetch(new URL("/transactions?from=2026-11-01&from=2026-11-02", origin), { headers: owner, redirect: "manual" });
  if (repeatedRange.status === 307) {
    assert.equal(new URL(repeatedRange.headers.get("location")!, origin).pathname, "/transactions");
  } else {
    // Next's loading boundary may stream the redirect after sending HTTP 200.
    assert.equal(repeatedRange.status, 200);
    const redirectMeta = (await repeatedRange.text()).match(/<meta[^>]*http-equiv="refresh"[^>]*>/)?.[0] ?? "";
    assert.match(redirectMeta, /url=\/transactions/, "repeated filters produce a streaming redirect, not a filtered result");
  }
  const historicalHistoryResponse = await get(`/transactions?member=${encodeURIComponent(`Historical Digital ${suffix}`)}`);
  assert.equal(historicalHistoryResponse.status, 200);
  const historicalHistory = await historicalHistoryResponse.text();
  assert.ok(historicalHistory.includes("GCash (historical)"), "transaction page labels retained GCash as historical");
  assert.ok(historicalHistory.includes(`/receipts/${historicalReceipt.id}`), "transaction page links the historical receipt");
  const bankHistory = await (await get("/transactions?method=BANK")).text();
  assert.ok(bankHistory.includes("Bank transfer (historical)"));
  assert.ok(bankHistory.includes(`/receipts/${bank.receipt.id}`));

  const receiptResponse = await get(`/receipts/${receipt.id}`);
  assert.equal(receiptResponse.status, 200);
  const receiptHtml = await receiptResponse.text();
  assert.ok(receiptHtml.includes("Cash payment receipt"), "cash receipt page renders");
  assert.ok(receiptHtml.includes(receipt.reference), "cash receipt page shows its receipt reference");
  assert.ok(receiptHtml.includes(confirmed.payment.reference), "cash receipt page shows its payment reference");
  const historicalMemberHtml = await (await get(`/members/${historicalMember.id}`)).text();
  assert.ok(historicalMemberHtml.includes("Historical digital claim retained read-only"), "member profile preserves the historical claim read-only");
  assert.ok(historicalMemberHtml.includes("GCASH"), "member profile preserves the original payment method");
  assert.ok(historicalMemberHtml.includes(`HISTORICAL-PAYMENT-${suffix}`), "member profile retains the historical payment reference");
  const historicalReceiptHtml = await (await get(`/receipts/${historicalReceipt.id}`)).text();
  assert.ok(historicalReceiptHtml.includes("Historical GCASH payment receipt"), "historical receipt remains readable");
  assert.ok(historicalReceiptHtml.includes("Historical digital transfer reference:"), "historical receipt identifies the retained digital reference");
  assert.ok(historicalReceiptHtml.includes(`HISTORICAL-${suffix}`), "historical receipt retains its transfer reference");

  for (const path of ["/digital", "/investigations", "/investigations/retired", "/outage-receipts", "/closing"]) {
    assert.equal((await get(path)).status, 404, `${path} stays retired`);
  }
  console.log("Authenticated HTTP Members lookup/eligibility/creation, /operate redirect, cash confirmation, history, receipt retrieval, and retired-page 404 checks PASS.");
} finally {
  await db.$disconnect();
  await admin.$disconnect();
}
