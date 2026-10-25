import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { bootstrapSyntheticOwner } from "../src/lib/identity";
import { assertSynthetic, type EmailSender } from "../src/lib/email";
import { db } from "../src/lib/db";
import { assessEligibility, remainingActiveTime } from "../src/lib/eligibility";

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic");
}
const binary = process.env.AGENT_BROWSER_BIN;
if (!binary) throw new Error("Set AGENT_BROWSER_BIN to an installed agent-browser 0.39.2 executable. Start npm run dev first.");
const session = `gym-identity-${randomUUID().slice(0, 8)}`;
const origin = process.env.BETTER_AUTH_URL!;
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
const suffix = randomUUID().slice(0, 8);
const email = `browser-owner-${suffix}@example.test`;
const staffEmail = `browser-staff-${suffix}@example.test`;
const username = `browser_${suffix}`;
const password = "Synthetic browser password 2026!";
let ownerUrl = "";
const sender: EmailSender = { async send(message) { ownerUrl = message.url; } };

function browser(...args: string[]) {
  const result = spawnSync(binary!, ["--session", session, ...args], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
  // Never emit full CLI arguments/output: setup URLs contain captured synthetic bearer tokens.
  if (result.status !== 0) throw new Error(`Browser step '${args[0]}' failed. Output withheld to protect captured links.`);
  return result.stdout;
}
function checkText(value: string) { browser("wait", "--text", value); }
function clickButton(name: string) { browser("find", "role", "button", "click", "--name", name, "--exact"); }
function fill(selector: string, value: string) { browser("fill", selector, value); }
function fillDateTime(selector: string, value: string) {
  // This CLI's fill leaves Chromium datetime-local inputs empty. Set the native
  // control value; retain form validation and the real submit/API path.
  const actual = evalBrowser(`(() => { const field = document.querySelector(${JSON.stringify(selector)}); field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', {bubbles:true})); field.dispatchEvent(new Event('change', {bubbles:true})); return field.value; })()`);
  assert.equal(new Date(`${actual}+08:00`).getTime(), new Date(`${value}+08:00`).getTime());
}
function audit(page: string) {
  const result = JSON.parse(browser("a11y", "--tags", "wcag2a,wcag2aa", "--json"));
  if (result.data.counts.incomplete) console.log(JSON.stringify(result.data.incomplete.map((item: { id: string; nodes: { target: string[]; failureSummary: string }[] }) => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))));
  assert.equal(result.data.counts.violations, 0, `${page} accessibility violations`);
  assert.equal(result.data.counts.incomplete, 0, `${page} incomplete accessibility checks`);
  console.log(`${page}: axe WCAG A/AA checks passed.`);
}
function evalBrowser(code: string) {
  const result = JSON.parse(browser("eval", code, "--json"));
  if (!result.success) throw new Error("Browser evaluation failed.");
  return result.data.result;
}
function focusedFeedback(id: string) {
  browser("wait", "--fn", `document.activeElement?.id === ${JSON.stringify(id)}`);
}
function associatedError(id: string) {
  assert.equal(evalBrowser(`(() => {
    const field = document.getElementById(${JSON.stringify(id)});
    return field?.getAttribute('aria-invalid') === 'true' && field.getAttribute('aria-describedby')?.split(' ').some(id => !!document.getElementById(id)?.textContent);
  })()`), true);
}
function alterRequest(path: string, patch: object) {
  // Send malformed data to the REAL server once, bypassing only the client schema.
  evalBrowser(`(() => {
    const send = window.fetch;
    window.fetch = function(input, init) {
      if (input === '${path}' && init?.method === 'POST') {
        window.fetch = send;
        return send.call(this, input, {...init, body: JSON.stringify({...JSON.parse(init.body), ...${JSON.stringify(patch)}})});
      }
      return send.call(this, input, init);
    }; return true;
  })()`);
}
function alterIdentityRequest(action: string, patch: object) { alterRequest(`/api/identity/${action}`, patch); }
function assertRefreshedMembership(payment: { reference: string; receipt: { id: string } | null }, collectorName: string) {
  assert.ok(payment.receipt);
  // Read the server-rendered panels before any navigation/reload, not the client success message.
  browser("wait", "--fn", `(() => {
    const access = document.getElementById('membership-access-title')?.parentElement;
    const history = document.getElementById('payment-history-title')?.parentElement;
    return access?.textContent.includes('A verified paid period is in effect.')
      && history?.textContent.includes(${JSON.stringify(payment.reference)})
      && !!history?.querySelector('a[href="/receipts/${payment.receipt.id}"]');
  })()`);
  assert.equal(evalBrowser(`document.getElementById('payment-history-title').parentElement.textContent.includes(${JSON.stringify(collectorName)})`), true);
  checkText("Full cash payment confirmed");
}
function assertRemainingTime(interval: { startsAt: Date; endsAt: Date }) {
  const checkedAt = new Date(evalBrowser("document.getElementById('membership-access-title').parentElement.querySelector('time').dateTime"));
  checkText(`Remaining in current paid period: ${remainingActiveTime(interval, checkedAt)} (rounded down at check time).`);
}
function assertReviewedDates(charge: { intendedStart: Date; intendedEnd: Date }) {
  const pht = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (const [label, date] of [["Proposed start (inclusive)", charge.intendedStart], ["Proposed end (exclusive)", charge.intendedEnd]] as const) {
    const shown = evalBrowser(`Array.from(document.querySelectorAll('dt')).find(node => node.textContent === '${label}').nextElementSibling.textContent`);
    assert.equal(shown, `${pht.format(date)} PHT`);
  }
}
async function confirmNewMembership(memberName: string, collector: { id: string; name: string }, durationDays: number) {
  const operator = await admin.operator.findUniqueOrThrow({ where: { id: collector.id } });
  const plan = await admin.plan.findFirstOrThrow({ where: { gymId: operator.gymId, durationDays } });
  browser("open", `${origin}/members`); fill("#member-name", memberName); clickButton("Create member"); checkText("Member created.");
  browser("find", "role", "link", "click", "--name", memberName, "--exact"); checkText("No verified paid period is recorded.");
  const memberId = new URL(evalBrowser("location.href")).pathname.split("/").at(-1)!;
  browser("select", "#charge-plan", plan.id);
  clickButton("Prepare charge preview"); checkText("Saved charge preview");
  checkText(`${durationDays} elapsed days`);
  browser("wait", "--fn", "document.getElementById('cash-received').disabled === false");
  fill("#cash-received", ((plan.priceCentavos - 1) / 100).toFixed(2)); clickButton("Confirm full cash"); checkText("No payment was recorded.");
  assert.equal(await admin.payment.count({ where: { memberId } }), 0);
  assert.equal(await admin.membershipPeriod.count({ where: { memberId } }), 0);
  checkText("No verified paid period is recorded.");
  fill("#cash-received", (plan.priceCentavos / 100).toFixed(2));
  clickButton("Confirm full cash"); checkText("Full cash payment confirmed");
  const payment = await admin.payment.findFirstOrThrow({ where: { memberId }, include: { receipt: true, period: true } });
  assert.equal(payment.collectedBy, collector.id); assert.equal(payment.verifiedBy, collector.id);
  assert.equal(payment.amountCentavos, plan.priceCentavos);
  assert.equal(payment.period!.endsAt.getTime() - payment.period!.startsAt.getTime(), durationDays * 86_400_000);
  const collectedDatePht = new Date(payment.collectedAt.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
  assert.equal(payment.period!.startsAt.toISOString(), new Date(`${collectedDatePht}T00:00:00+08:00`).toISOString());
  assertRefreshedMembership(payment, collector.name);
  const operation = await admin.idempotencyOperation.findFirstOrThrow({ where: { paymentId: payment.id } });
  const replay = evalBrowser(`fetch('/api/payments', {method:'POST',headers:{'content-type':'application/json','idempotency-key':'${operation.operationKey}'},body:JSON.stringify({chargeId:'${payment.chargeId}',cashReceived:'${(plan.priceCentavos / 100).toFixed(2)}'})}).then(async r=>({status:r.status,body:await r.json()}))`);
  assert.equal(replay.status, 200); assert.equal(replay.body.payment.id, payment.id);
  assert.equal(replay.body.receipt.id, payment.receipt!.id);
  assert.equal(await admin.payment.count({ where: { memberId } }), 1);
  assert.equal(await admin.membershipPeriod.count({ where: { memberId } }), 1);
  const intervals = await admin.effectiveEntitlement.findMany({ where: { memberId, isCurrentProjection: true } });
  assert.equal(intervals.length, 1);
  assert.equal(assessEligibility(intervals, payment.period!.startsAt).status, "ELIGIBLE");
  assert.equal(assessEligibility(intervals, new Date(payment.period!.endsAt.getTime() - 1)).status, "ELIGIBLE");
  assert.equal(assessEligibility(intervals, payment.period!.endsAt).status, "EXPIRED");
  browser("open", `${origin}/receipts/${payment.receipt!.id}`); browser("reload");
  checkText("Cash payment receipt"); checkText(payment.reference); checkText(payment.receipt!.reference); checkText(collector.name); checkText(plan.name);
  browser("open", `${origin}/members/${memberId}`); checkText("A verified paid period is in effect.");
  checkText(payment.reference); checkText(collector.name);
  console.log(`S-01 acceptance: ${operator.role} ${durationDays} days UI join, short/full cash, attributed history, durable receipt, same-key replay and stored eligibility boundaries passed.`);
  // The real UI must preserve the original term when selling one advance renewal.
  browser("select", "#charge-plan", plan.id);
  clickButton("Prepare charge preview"); checkText("Saved charge preview");
  checkText("uncompleted purchase request"); checkText("Remaining in current paid period:");
  assertRemainingTime(payment.period!);
  const renewalId = new URL(evalBrowser("location.href")).searchParams.get("charge")!;
  const renewal = await admin.charge.findUniqueOrThrow({ where: { id: renewalId } });
  assert.equal(renewal.durationDays, durationDays);
  assert.equal(renewal.priceCentavos, plan.priceCentavos);
  assertReviewedDates(renewal);
  assert.equal(renewal.intendedStart.getTime(), payment.period!.endsAt.getTime());
  assert.equal(await admin.membershipPeriod.count({ where: { memberId } }), 1, "A renewal preview grants no paid term");
  browser("wait", "--fn", "document.getElementById('cash-received').disabled === false");
  clickButton("Confirm full cash"); checkText("Full cash payment confirmed");
  const renewed = await admin.payment.findUniqueOrThrow({ where: { chargeId: renewalId }, include: { period: true, receipt: true } });
  assertRefreshedMembership(renewed, collector.name);
  checkText("Scheduled paid period:"); checkText("Another advance renewal is available once the scheduled paid period starts.");
  assert.equal(renewed.period!.startsAt.getTime(), payment.period!.endsAt.getTime());
  assert.equal(renewed.period!.endsAt.getTime(), renewal.intendedEnd.getTime());
  assert.equal(renewed.period!.endsAt.getTime() - renewed.period!.startsAt.getTime(), durationDays * 86_400_000);
  assert.deepEqual(await admin.membershipPeriod.findUniqueOrThrow({ where: { id: payment.period!.id } }), payment.period);
  const allIntervals = await admin.effectiveEntitlement.findMany({ where: { memberId, isCurrentProjection: true } });
  assert.equal(assessEligibility(allIntervals, new Date(payment.period!.endsAt.getTime() - 1)).interval!.endsAt.getTime(), payment.period!.endsAt.getTime());
  assert.equal(assessEligibility(allIntervals, payment.period!.endsAt).interval!.endsAt.getTime(), renewed.period!.endsAt.getTime());
  const previews = await admin.charge.count({ where: { memberId } });
  clickButton("Prepare charge preview"); checkText("A future paid period already exists.");
  assert.equal(await admin.charge.count({ where: { memberId } }), previews);
  const renewalOperation = await admin.idempotencyOperation.findFirstOrThrow({ where: { paymentId: renewed.id } });
  const recovered = evalBrowser(`fetch('/api/payments', {method:'POST',headers:{'content-type':'application/json','idempotency-key':'${renewalOperation.operationKey}'},body:JSON.stringify({chargeId:'${renewalId}',cashReceived:'${(plan.priceCentavos / 100).toFixed(2)}'})}).then(async r=>({status:r.status,body:await r.json()}))`);
  assert.equal(recovered.status, 200); assert.equal(recovered.body.payment.id, renewed.id);
  assert.equal(await admin.payment.count({ where: { memberId } }), 2);
  assert.equal(await admin.membershipPeriod.count({ where: { memberId } }), 2);
  audit(`${operator.role} ${durationDays}-day early renewal`);
  if (durationDays === 30) {
    evalBrowser("window.scrollTo(0, 0)");
    browser("screenshot", resolve(`.local/s02-renewal-${operator.role.toLowerCase()}-desktop.png`));
    browser("set", "viewport", "375", "812");
    evalBrowser("window.scrollTo(0, 0)");
    assert.equal(evalBrowser("document.documentElement.scrollWidth <= innerWidth"), true);
    audit(`${operator.role} mobile renewal`);
    browser("screenshot", resolve(`.local/s02-renewal-${operator.role.toLowerCase()}-mobile.png`));
    browser("set", "viewport", "1280", "900");
  }
  await verifyLateRenewal(collector, plan);
  console.log(`S-02 acceptance: ${operator.role} ${durationDays} days early/late renewal, preserved original, current/scheduled distinction, queued denial and committed-key recovery passed.`);
}

// Synthetic historical/future fixtures only. Never rewrite immutable confirmed history to move time.
async function paidFixture(collectorId: string, plan: { id: string; gymId: string; name: string; durationDays: number; priceCentavos: number; version: number }, startsAt: Date) {
  return admin.$transaction(async tx => {
    const member = await tx.member.create({ data: { gymId: plan.gymId, fullName: `Renewal Fixture ${randomUUID().slice(0, 8)}`, nameKey: `fixture-${randomUUID()}`, createdBy: collectorId } });
    const endsAt = new Date(startsAt.getTime() + plan.durationDays * 86_400_000);
    const charge = await tx.charge.create({ data: { gymId: plan.gymId, memberId: member.id, planId: plan.id, planName: plan.name, durationDays: plan.durationDays, priceCentavos: plan.priceCentavos, planVersion: plan.version, preparedBy: collectorId, intendedStart: startsAt, intendedEnd: endsAt } });
    const collectedAt = new Date(Math.min(Date.now(), startsAt.getTime()));
    const payment = await tx.payment.create({ data: { gymId: plan.gymId, memberId: member.id, chargeId: charge.id, reference: `SYNTHETIC-${randomUUID()}`, amountCentavos: plan.priceCentavos, collectedBy: collectorId, collectedAt, verifiedBy: collectorId, verifiedAt: collectedAt } });
    const period = await tx.membershipPeriod.create({ data: { gymId: plan.gymId, memberId: member.id, paymentId: payment.id, confirmedBy: collectorId, startsAt, endsAt } });
    await tx.effectiveEntitlement.create({ data: { gymId: plan.gymId, memberId: member.id, periodId: period.id, startsAt, endsAt } });
    await tx.paymentReceipt.create({ data: { gymId: plan.gymId, paymentId: payment.id, reference: `SYNTHETIC-RECEIPT-${randomUUID()}` } });
    return { member, period };
  });
}

async function verifyLateRenewal(collector: { id: string; name: string }, plan: { id: string; gymId: string; name: string; durationDays: number; priceCentavos: number; version: number }) {
  const localDate = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  const midnight = new Date(`${localDate}T00:00:00+08:00`);
  const fixture = await paidFixture(collector.id, plan, new Date(midnight.getTime() - (plan.durationDays + 2) * 86_400_000));
  browser("open", `${origin}/members/${fixture.member.id}`);
  checkText("The most recent verified paid period has expired.");
  assert.equal(evalBrowser("document.getElementById('membership-access-title').parentElement.textContent.includes('Remaining in current paid period:')"), false);
  browser("select", "#charge-plan", plan.id); clickButton("Prepare charge preview"); checkText("Saved charge preview");
  const chargeId = new URL(evalBrowser("location.href")).searchParams.get("charge")!;
  const preview = await admin.charge.findUniqueOrThrow({ where: { id: chargeId } });
  assertReviewedDates(preview);
  assert.equal(preview.intendedStart.getTime(), midnight.getTime());
  assert.notEqual(preview.intendedStart.getTime(), fixture.period.endsAt.getTime());
  browser("wait", "--fn", "document.getElementById('cash-received').disabled === false");
  fill("#cash-received", ((plan.priceCentavos - 1) / 100).toFixed(2)); clickButton("Confirm full cash"); checkText("No payment was recorded.");
  checkText("The most recent verified paid period has expired.");
  assert.equal(await admin.membershipPeriod.count({ where: { memberId: fixture.member.id } }), 1);
  fill("#cash-received", (plan.priceCentavos / 100).toFixed(2)); clickButton("Confirm full cash"); checkText("Full cash payment confirmed");
  const paid = await admin.payment.findUniqueOrThrow({ where: { chargeId }, include: { receipt: true, period: true } });
  assertRefreshedMembership(paid, collector.name);
  assert.equal(paid.period!.startsAt.getTime(), preview.intendedStart.getTime());
  assert.equal(paid.period!.endsAt.getTime(), preview.intendedEnd.getTime());
  assert.equal(paid.period!.endsAt.getTime() - paid.period!.startsAt.getTime(), plan.durationDays * 86_400_000);
  assert.deepEqual(await admin.membershipPeriod.findUniqueOrThrow({ where: { id: fixture.period.id } }), fixture.period);
  browser("open", `${origin}/receipts/${paid.receipt!.id}`); browser("reload"); checkText(paid.reference);
  browser("open", `${origin}/members/${fixture.member.id}`); checkText("Remaining in current paid period:");
  assertRemainingTime(paid.period!);
  const pht = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short", hourCycle: "h23" });
  checkText(`${pht.format(paid.period!.endsAt)} PHT exclusive`);
  audit(`${plan.durationDays}-day late renewal`);
  if (plan.durationDays === 30) {
    const future = await paidFixture(collector.id, plan, new Date(midnight.getTime() + 86_400_000));
    browser("open", `${origin}/members/${future.member.id}`); checkText("Not eligible yet"); checkText("Scheduled paid period:");
    assert.equal(evalBrowser("document.getElementById('membership-access-title').parentElement.textContent.includes('Remaining in current paid period:')"), false);
    clickButton("Prepare charge preview"); checkText("A future paid period already exists.");
    assert.equal(await admin.payment.count({ where: { memberId: future.member.id } }), 1);
    assert.equal(await admin.charge.count({ where: { memberId: future.member.id } }), 1);
    audit("Future-only paid membership");
  }
}
async function capturedUrl(operatorId: string) {
  const invitation = await admin.invitation.findFirstOrThrow({ where: { operatorId, consumedAt: null, sentAt: { not: null } }, orderBy: { createdAt: "desc" } });
  return JSON.parse(readFileSync(resolve(".local/mailbox", `${invitation.id}.json`), "utf8")).url as string;
}

let primaryFailure: unknown;
try {
  await admin.rateLimit.deleteMany();
  const gymId = randomUUID();
  await bootstrapSyntheticOwner({ gymId, gymName: "Synthetic Browser Gym", email, name: "Browser Owner" }, sender, admin);
  for (const path of ["sign-up/email", "reset-password", "change-password", "update-user"]) {
    const response = await fetch(`${origin}/api/auth/${path}`, { method: "POST", headers: { "content-type": "application/json", origin }, body: "{}" });
    assert.equal(response.status, 404, `Unreviewed provider route ${path} must be blocked`);
  }
  assert.equal((await fetch(`${origin}/api/identity/operators`)).status, 401);
  assert.equal((await fetch(`${origin}/api/identity/invite`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ name: "Intruder", email: staffEmail, username }) })).status, 401);
  assert.equal((await fetch(`${origin}/api/identity/setup`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: "{}" })).status, 403);
  assert.equal((await fetch(`${origin}/api/identity/setup`, { method: "POST", headers: { "content-type": "application/json", origin }, body: "x".repeat(5000) })).status, 413);
  console.log("Direct HTTP: signup/provider bypass, anonymous administration, foreign origin, and oversized body denied.");

  browser("open", `${origin}/login`); audit("Login");
  browser("set", "viewport", "375", "812");
  assert.equal(evalBrowser("document.documentElement.scrollWidth <= window.innerWidth"), true);
  browser("press", "Tab");
  assert.equal(evalBrowser("document.activeElement?.textContent === 'Skip to content'"), true);
  browser("set", "viewport", "1280", "900");

  browser("open", ownerUrl);
  audit("Setup");
  fill("#password", password); fill("#confirmation", `${password} mismatch`);
  clickButton("Save private password"); checkText("Passwords must match."); focusedFeedback("setup-feedback");
  associatedError("confirmation");
  assert.equal(evalBrowser("document.getElementById('password').value === '' && document.getElementById('confirmation').value === ''"), true);
  audit("Setup mismatch errors");
  browser("press", "Tab"); browser("press", "Enter");
  assert.equal(evalBrowser("document.activeElement?.id"), "confirmation");
  fill("#password", password); fill("#confirmation", password);
  assert.equal(evalBrowser("document.getElementById('confirmation').getAttribute('aria-invalid')"), "false");
  alterIdentityRequest("setup", { role: "OWNER" });
  clickButton("Save private password"); checkText("Check the account fields and try again."); focusedFeedback("setup-feedback");
  assert.equal((await admin.gym.findUniqueOrThrow({ where: { id: gymId } })).state, "PENDING");
  fill("#password", password); fill("#confirmation", password);
  clickButton("Save private password"); checkText("Your password is ready");
  browser("open", `${origin}/login`); browser("open", ownerUrl); fill("#password", password); fill("#confirmation", password);
  clickButton("Save private password"); checkText("Link expired, replaced, or already used.");
  focusedFeedback("setup-feedback");
  browser("open", `${origin}/login`);
  clickButton("Forgot your password?"); fill("#identifier", "owner@example.com"); clickButton("Request recovery link");
  checkText("Enter a reserved .test email"); focusedFeedback("identity-login-feedback"); associatedError("identifier");
  assert.equal(evalBrowser("document.getElementById('identifier').value"), "owner@example.com");
  audit("Owner recovery validation errors");
  browser("press", "Tab"); browser("press", "Enter");
  assert.equal(evalBrowser("document.activeElement?.id"), "identifier");
  fill("#identifier", `missing-${suffix}@example.test`);
  alterIdentityRequest("reset-owner", { email: "invalid" }); clickButton("Request recovery link");
  checkText("Check the account fields and try again."); focusedFeedback("identity-login-feedback"); associatedError("identifier");
  clickButton("Request recovery link"); checkText("If an active owner account matches");
  clickButton("Back to sign in");
  fill("#identifier", email); fill("#password", "incorrect password"); clickButton("Sign in"); checkText("Unable to sign in.");
  focusedFeedback("identity-login-feedback");
  assert.equal(evalBrowser("document.getElementById('password').value"), "");
  fill("#password", password); clickButton("Sign in"); checkText("Welcome, Browser Owner");
  browser("find", "role", "link", "click", "--name", "Plans and pricing", "--exact"); checkText("Set up the approved catalogue");
  clickButton("Apply approved catalogue"); checkText("Verify your password again before this action.");
  fill("#pricing-password", "incorrect password"); clickButton("Verify password"); checkText("Unable to verify your password.");
  focusedFeedback("pricing-password-feedback"); associatedError("pricing-password");
  assert.equal(evalBrowser("document.getElementById('pricing-password').value"), "");
  audit("Pricing reauthentication errors");
  fill("#pricing-password", password); clickButton("Verify password"); checkText("Password verified for five minutes.");
  clickButton("Apply approved catalogue"); checkText("Current catalogue");
  const monthly = await admin.plan.findFirstOrThrow({ where: { gymId, durationDays: 30 } });
  fill(`#price-${monthly.id}`, "800.001");
  assert.equal(evalBrowser(`document.getElementById('price-${monthly.id}').checkValidity()`), false);
  clickButton("Save Monthly price"); checkText("Enter a positive PHP price");
  focusedFeedback("plan-feedback"); associatedError(`price-${monthly.id}`);
  assert.equal(evalBrowser(`document.getElementById('price-${monthly.id}').value`), "800.001");
  browser("find", "role", "link", "click", "--name", "Review this price", "--exact"); focusedFeedback(`price-${monthly.id}`);
  audit("Plan price validation errors");
  fill(`#price-${monthly.id}`, "800.00");
  assert.equal(evalBrowser(`document.getElementById('price-${monthly.id}').getAttribute('aria-invalid')`), "false");
  alterRequest("/api/plans", { price: "0" }); clickButton("Save Monthly price");
  checkText("Only catalogue initialization and price updates are accepted."); focusedFeedback("plan-feedback"); associatedError(`price-${monthly.id}`);
  assert.equal(evalBrowser(`document.getElementById('price-${monthly.id}').value`), "800.00");
  assert.equal((await admin.plan.findUniqueOrThrow({ where: { id: monthly.id } })).version, monthly.version);
  clickButton("Save Monthly price"); checkText("Catalogue saved."); audit("Plan pricing");
  browser("open", origin); checkText("Welcome, Browser Owner");
  clickButton("Verify password"); checkText("Enter your current password."); focusedFeedback("reauth-password-feedback"); associatedError("reauth-password");
  fill("#reauth-password", password); clickButton("Verify password"); checkText("Password verified for five minutes.");
  fill("#staff-name", "   "); fill("#staff-username", "ab"); fill("#staff-email", "staff@example.com");
  clickButton("Send invitation"); checkText("Check the account fields below."); focusedFeedback("operator-feedback");
  for (const id of ["staff-name", "staff-username", "staff-email"]) associatedError(id);
  assert.equal(evalBrowser("document.getElementById('staff-name').value"), "   ");
  assert.equal(await admin.operator.count({ where: { gymId, role: "STAFF" } }), 0);
  audit("Invitation validation errors");
  browser("set", "viewport", "375", "812");
  assert.equal(evalBrowser("document.documentElement.scrollWidth <= window.innerWidth"), true);
  browser("screenshot", resolve(".local/identity-validation-mobile.png"));
  browser("set", "viewport", "1280", "900");
  browser("press", "Tab"); browser("press", "Enter");
  assert.equal(evalBrowser("document.activeElement?.id"), "staff-email");
  fill("#staff-name", "Browser Staff"); fill("#staff-username", username); fill("#staff-email", staffEmail);
  assert.equal(evalBrowser("document.getElementById('staff-username').getAttribute('aria-invalid')"), "false");
  alterIdentityRequest("invite", { username: "invalid username" }); clickButton("Send invitation");
  checkText("Check the account fields and try again."); focusedFeedback("operator-feedback"); associatedError("staff-username");
  assert.equal(evalBrowser("document.getElementById('staff-name').value"), "Browser Staff");
  assert.equal(evalBrowser("document.getElementById('staff-email').value"), staffEmail);
  evalBrowser(`(() => {
    const send = window.fetch;
    window.fetch = function(input, init) {
      if (input === '/api/identity/invite' && init?.method === 'POST') {
        window.fetch = send; return Promise.reject(new TypeError('Synthetic connection interrupted. Try again.'));
      }
      return send.call(this, input, init);
    }; return true;
  })()`);
  clickButton("Send invitation"); checkText("Synthetic connection interrupted."); focusedFeedback("operator-feedback");
  assert.equal(evalBrowser("document.getElementById('staff-email').value"), staffEmail);
  assert.equal(await admin.operator.count({ where: { gymId, role: "STAFF" } }), 0);
  clickButton("Send invitation"); checkText("Link captured for the recipient."); checkText("Pending setup");
  audit("Owner settings");
  browser("set", "viewport", "375", "812");
  assert.equal(evalBrowser("document.documentElement.scrollWidth <= window.innerWidth"), true);
  browser("screenshot", resolve(".local/identity-owner-mobile.png"));
  browser("set", "viewport", "1280", "900");
  const staff = await admin.operator.findFirstOrThrow({ where: { gymId, role: "STAFF" } });
  const staffUrl = await capturedUrl(staff.id);
  clickButton("Sign out"); checkText("You are signed out.");
  browser("open", staffUrl); fill("#password", password); fill("#confirmation", password);
  clickButton("Save private password"); checkText("Your password is ready");
  browser("open", `${origin}/login`); browser("find", "role", "radio", "click", "--name", "Staff", "--exact");
  fill("#identifier", username); fill("#password", password); clickButton("Sign in"); checkText("Welcome, Browser Staff");
  audit("Staff landing");
  assert.equal(evalBrowser("fetch('/api/identity/operators').then(r => r.status)"), 403);
  for (const action of ["reset-staff", "disable"]) {
    assert.equal(evalBrowser(`fetch('/api/identity/${action}', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operatorId:'${staff.id}'})}).then(r=>r.status)`), 403);
  }
  assert.equal(evalBrowser(`fetch('/api/identity/capabilities', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operatorId:'${staff.id}',canManageMembers:true,canCollectCash:true})}).then(r=>r.status)`), 403);
  assert.equal(evalBrowser("fetch('/api/plans',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'initialize'})}).then(r=>r.status)"), 403);
  clickButton("Sign out"); checkText("You are signed out.");
  fill("#identifier", email); fill("#password", password); clickButton("Sign in"); checkText("Welcome, Browser Owner");
  fill("#reauth-password", password); clickButton("Verify password"); checkText("Password verified for five minutes.");
  browser("check", "input[name=members]"); browser("check", "input[name=cash]");
  alterIdentityRequest("capabilities", { canCollectCash: "true" }); clickButton("Save permissions");
  checkText("Check the account fields and try again."); focusedFeedback("operator-feedback"); associatedError(`cash-${staff.id}`);
  assert.equal(evalBrowser("document.querySelector('input[name=cash]').checked && document.querySelector('input[name=members]').checked"), true);
  audit("Capability validation errors");
  const browserOwner = await admin.operator.findFirstOrThrow({ where: { gymId, role: "OWNER" } });
  await admin.session.updateMany({ where: { userId: browserOwner.userId }, data: { reauthenticatedAt: new Date(Date.now() - 300_000) } });
  clickButton("Save permissions"); checkText("Verify your password again before this action."); focusedFeedback("operator-feedback");
  assert.equal(evalBrowser("document.querySelector('input[name=cash]').checked && document.querySelector('input[name=members]').checked"), true);
  await admin.rateLimit.deleteMany({ where: { key: { startsWith: "identity:reauthenticate:" } } });
  fill("#reauth-password", password); clickButton("Verify password"); checkText("Password verified for five minutes.");
  clickButton("Save permissions"); checkText("Staff permissions saved.");
  assert.equal((await admin.operator.findUniqueOrThrow({ where: { id: staff.id } })).canCollectCash, true);
  browser("uncheck", "input[name=cash]"); clickButton("Save permissions"); checkText("Staff permissions saved.");
  assert.equal((await admin.operator.findUniqueOrThrow({ where: { id: staff.id } })).canCollectCash, false);
  browser("find", "role", "link", "click", "--name", "Find or create a member", "--exact"); checkText("Find a member");
  const beforeMembers = await admin.member.count({ where: { gymId } });
  fill("#member-name", "   "); clickButton("Create member"); checkText("Enter a member name with 1–100 visible characters.");
  assert.equal(evalBrowser("document.activeElement?.id"), "member-feedback");
  assert.equal(evalBrowser("document.getElementById('member-name').value"), "   ");
  assert.equal(evalBrowser("document.getElementById('member-name').getAttribute('aria-describedby')"), "member-name-error");
  audit("Member validation errors");
  browser("press", "Tab"); browser("press", "Enter");
  assert.equal(evalBrowser("document.activeElement?.id"), "member-name");
  fill("#member-name", "Browser Synthetic Member");
  assert.equal(evalBrowser("document.getElementById('member-name').getAttribute('aria-invalid')"), "false");
  // Bypass the shared client schema once to prove real HTTP server rejection and safe form recovery.
  evalBrowser(`(() => {
    const original = window.fetch;
    window.fetch = function(input, init) {
      if (input === '/api/members' && init?.method === 'POST') {
        window.fetch = original;
        return original.call(this, input, {...init, body:JSON.stringify({fullName:null})});
      }
      return original.call(this, input, init);
    };
    return true;
  })()`);
  clickButton("Create member"); checkText("Enter a member name with 1–100 visible characters.");
  assert.equal(evalBrowser("document.activeElement?.id"), "member-feedback");
  assert.equal(evalBrowser("document.getElementById('member-name').value"), "Browser Synthetic Member");
  assert.equal(await admin.member.count({ where: { gymId } }), beforeMembers);
  assert.equal(evalBrowser("fetch('/api/members?q=one&q=two').then(r=>r.status)"), 400);
  browser("set", "viewport", "375", "812");
  assert.equal(evalBrowser("document.documentElement.scrollWidth <= window.innerWidth"), true);
  audit("Member server rejection at mobile width");
  browser("screenshot", resolve(".local/member-validation-mobile.png"));
  browser("set", "viewport", "1280", "900");
  fill("#member-name", "Browser Synthetic Member"); clickButton("Create member"); checkText("Member created.");
  fill("#search-name", "Browser Synthetic Member"); clickButton("Search"); checkText("1 matching members");
  assert.equal(evalBrowser("document.getElementById('search-name').value"), "Browser Synthetic Member");
  clickButton("Create member"); checkText("A member with this name exists.");
  clickButton("Create member"); checkText("Confirm that you reviewed the matches and this is a separate person.");
  assert.equal(evalBrowser("document.getElementById('duplicate-review').getAttribute('aria-invalid')"), "true");
  browser("check", "input[name=confirmDuplicate]"); clickButton("Create member"); checkText("Member created.");
  console.log("Z-02 browser: shared/client and direct server rejection, retained values, corrected resubmission, keyboard error links, duplicate review, scoped search, mobile and accessibility passed.");
  audit("Member directory");
  browser("find", "role", "link", "click", "--name", "Browser Synthetic Member", "--exact"); checkText("Not eligible"); checkText("No verified paid period is recorded.");
  const previewsBeforeInvalid = await admin.charge.count({ where: { gymId } });
  alterRequest("/api/charges", { planId: "invalid-reference" }); clickButton("Prepare charge preview");
  checkText("Only member and plan references are accepted."); focusedFeedback("cash-error");
  assert.equal(await admin.charge.count({ where: { gymId } }), previewsBeforeInvalid);
  clickButton("Prepare charge preview"); checkText("Saved charge preview");
  const firstPreviewUrl = evalBrowser("window.location.href");
  const firstPreviewId = new URL(firstPreviewUrl).searchParams.get("charge")!;
  const original = await admin.charge.findUniqueOrThrow({ where: { id: firstPreviewId } });
  assert.equal(original.priceCentavos, 80_000);
  browser("reload"); checkText("Saved charge preview"); checkText("₱800.00");
  browser("open", `${origin}/plans`); fill("#pricing-password", password); clickButton("Verify password"); checkText("Password verified for five minutes.");
  fill(`#price-${monthly.id}`, "900.25"); clickButton("Save Monthly price"); checkText("Catalogue saved.");
  browser("open", firstPreviewUrl); checkText("The catalogue price has changed."); checkText("₱800.00");
  assert.deepEqual(await admin.charge.findUniqueOrThrow({ where: { id: firstPreviewId } }), original);
  clickButton("Prepare charge preview"); browser("wait", "--fn", `new URL(location.href).searchParams.get('charge') !== '${firstPreviewId}'`);
  checkText("Saved charge preview"); checkText("₱900.25"); checkText("No verified paid period is recorded.");
  browser("wait", "--fn", "document.getElementById('cash-received').disabled === false");
  fill("#cash-received", "900.251"); clickButton("Confirm full cash");
  checkText("Enter the full cash amount in PHP, with no more than two decimal places."); focusedFeedback("cash-error"); associatedError("cash-received");
  assert.equal(evalBrowser("Object.keys(sessionStorage).some(key => key.startsWith('cash-recovery:'))"), false);
  fill("#cash-received", "900"); clickButton("Confirm full cash"); checkText("No payment was recorded.");
  checkText("No verified paid period is recorded."); checkText("No confirmed payments recorded.");
  const latestPreviewId = new URL(evalBrowser("window.location.href")).searchParams.get("charge")!;
  const latestPreview = await admin.charge.findUniqueOrThrow({ where: { id: latestPreviewId } });
  const browserMember = await admin.member.findUniqueOrThrow({ where: { id: latestPreview.memberId } });
  assert.equal(await admin.payment.count({ where: { memberId: browserMember.id } }), 0);
  assert.equal(await admin.membershipPeriod.count({ where: { memberId: browserMember.id } }), 0);
  fill("#cash-received", "900.25"); audit("Cash confirmation");
  evalBrowser(`(() => {
    const send = window.fetch;
    window.fetch = async function (...args) {
      const response = await send.apply(this, args);
      if (args[0] === '/api/payments' && response.ok) {
        window.fetch = send;
        throw new TypeError('Synthetic lost response after commit.');
      }
      return response;
    };
    return true;
  })()`);
  clickButton("Confirm full cash"); checkText("Synthetic lost response after commit.");
  const committedPayment = await admin.payment.findFirstOrThrow({ where: { memberId: browserMember.id } });
  const recoveryRecord = () => evalBrowser("JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find(key => key.startsWith('cash-recovery:'))))");
  const originalOperation = recoveryRecord();
  assert.equal(originalOperation.chargeId, latestPreviewId);
  alterRequest("/api/payments", { cashReceived: "900.251" }); clickButton("Retry same confirmation");
  checkText("Only the charge reference and cash amount are accepted."); focusedFeedback("cash-error");
  assert.deepEqual(recoveryRecord(), originalOperation);
  assert.equal(await admin.payment.count({ where: { memberId: browserMember.id } }), 1);
  const previewsBeforeRecovery = await admin.charge.count({ where: { gymId } });
  async function assertRecoveryGate() {
    checkText("Confirmation status unknown.");
    assert.equal(evalBrowser("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Prepare charge preview').disabled"), true);
    // Bypass the disabled button to exercise the submit handler's recovery guard too.
    evalBrowser("document.getElementById('charge-plan').form.requestSubmit(); true");
    assert.equal(await admin.charge.count({ where: { gymId } }), previewsBeforeRecovery);
    assert.deepEqual(recoveryRecord(), originalOperation);
    assert.equal(await admin.payment.count({ where: { memberId: browserMember.id } }), 1);
  }
  await assertRecoveryGate();
  // An unrelated 4xx from a later attempt cannot prove the original did not commit.
  evalBrowser(`(() => {
    const send = window.fetch;
    window.fetch = async function (...args) {
      if (args[0] === '/api/payments') {
        window.fetch = send;
        return Response.json({error:'Synthetic later 409; original outcome unresolved.'}, {status:409});
      }
      return send.apply(this, args);
    }; return true;
  })()`);
  clickButton("Retry same confirmation"); checkText("Synthetic later 409;"); await assertRecoveryGate();
  browser("reload"); checkText("Retry same confirmation");
  assert.equal(evalBrowser("document.getElementById('cash-received').disabled"), true);
  await assertRecoveryGate(); audit("Cash retry after reload");
  // Navigating without a preview, to another member, or to another saved preview
  // must retain the original payload/key and prevent a replacement collection.
  browser("open", `${origin}/members/${browserMember.id}`); await assertRecoveryGate();
  const otherMember = await admin.member.findFirstOrThrow({ where: { gymId, id: { not: browserMember.id } } });
  browser("open", `${origin}/members/${otherMember.id}`); await assertRecoveryGate();
  browser("open", `${origin}/plans`); fill("#pricing-password", password); clickButton("Verify password"); checkText("Password verified for five minutes.");
  fill(`#price-${monthly.id}`, "1000.25"); clickButton("Save Monthly price"); checkText("Catalogue saved.");
  browser("open", firstPreviewUrl); checkText("The catalogue price has changed."); await assertRecoveryGate();
  assert.equal(evalBrowser("document.getElementById('cash-received').value"), "900.25");
  browser("find", "role", "link", "click", "--name", "Review unresolved charge", "--exact");
  browser("wait", "--fn", `new URL(location.href).searchParams.get('charge') === '${latestPreviewId}'`);
  await assertRecoveryGate();
  browser("set", "viewport", "375", "812");
  assert.equal(evalBrowser("document.documentElement.scrollWidth <= window.innerWidth"), true);
  audit("Cash recovery after catalogue change"); browser("screenshot", resolve(".local/payment-recovery-mobile.png"));
  browser("set", "viewport", "1280", "900"); clickButton("Retry same confirmation");
  checkText("Full cash payment confirmed"); checkText("Receipt reference:");
  const browserPayment = await admin.payment.findFirstOrThrow({ where: { memberId: browserMember.id }, include: { period: true, receipt: true } });
  assert.equal(browserPayment.id, committedPayment.id); checkText(committedPayment.reference);
  assert.equal(await admin.payment.count({ where: { memberId: browserMember.id } }), 1);
  assert.equal(browserPayment.amountCentavos, 90_025); assert.ok(browserPayment.period); assert.ok(browserPayment.receipt);
  assert.equal(await admin.membershipPeriod.count({ where: { memberId: browserMember.id } }), 1);
  assert.equal(await admin.idempotencyOperation.count({ where: { gymId, operationKey: originalOperation.key, paymentId: committedPayment.id } }), 1);
  assert.equal(evalBrowser("Object.keys(sessionStorage).some(key => key.startsWith('cash-recovery:'))"), false);
  assertRefreshedMembership(browserPayment, "Browser Owner");
  audit("Confirmed cash result");
  checkText("Eligible"); checkText("Current paid period"); checkText("Payment history"); checkText("Collected by"); checkText("Entry recorded"); checkText("Verified by"); checkText("Paid period");
  const receiptPath = evalBrowser("Array.from(document.querySelectorAll('a')).find(a => a.getAttribute('href')?.startsWith('/receipts/'))?.getAttribute('href')");
  assert.equal(receiptPath, `/receipts/${browserPayment.receipt!.id}`);
  browser("open", `${origin}${receiptPath}`); checkText("Cash payment receipt"); checkText(browserPayment.receipt!.reference); checkText(browserPayment.reference); checkText("Browser Owner"); checkText("₱900.25"); checkText("Paid period");
  audit("Retrievable receipt");
  audit("Charge review");
  browser("set", "viewport", "375", "812");
  assert.equal(evalBrowser("document.documentElement.scrollWidth <= window.innerWidth"), true);
  evalBrowser("document.getElementById('receipt-title').scrollIntoView({block:'start'}); true");
  browser("screenshot", resolve(".local/cash-confirmed-mobile.png")); browser("set", "viewport", "1280", "900");
  console.log("R-01 browser: committed lost response, replacement submit guard, later 409, reload, member/preview navigation, catalogue change, and original-key replay passed with exactly one payment/period.");
  const owner = await admin.operator.findFirstOrThrow({ where: { gymId, role: "OWNER" } });
  for (const duration of [30, 90, 180]) await confirmNewMembership(`Owner ${duration} Day Acceptance Member`, { id: owner.id, name: "Browser Owner" }, duration);
  // Review a real early renewal, then verify the displayed dates against PostgreSQL.
  browser("open", `${origin}/members/${browserMember.id}`); clickButton("Prepare charge preview"); checkText("Saved charge preview");
  const renewalId = new URL(evalBrowser("location.href")).searchParams.get("charge")!;
  const renewal = await admin.charge.findUniqueOrThrow({ where: { id: renewalId } });
  assert.equal(renewal.intendedStart.toISOString(), browserPayment.period!.endsAt.toISOString());
  assertReviewedDates(renewal);
  browser("wait", "--fn", "document.getElementById('cash-received').disabled === false");
  audit("Early renewal review"); clickButton("Confirm full cash"); checkText("Full cash payment confirmed");
  const renewed = await admin.payment.findUniqueOrThrow({ where: { chargeId: renewalId }, include: { period: true } });
  assert.equal(renewed.period!.startsAt.toISOString(), renewal.intendedStart.toISOString());
  assert.equal(renewed.period!.endsAt.toISOString(), renewal.intendedEnd.toISOString());
  const previewsBeforeQueued = await admin.charge.count({ where: { memberId: browserMember.id } });
  clickButton("Prepare charge preview"); checkText("A future paid period already exists.");
  assert.equal(await admin.charge.count({ where: { memberId: browserMember.id } }), previewsBeforeQueued);
  assert.equal(await admin.payment.count({ where: { memberId: browserMember.id } }), 2);
  audit("Queued renewal preview denied");

  // Another operator confirms a distinct collection after this browser's review.
  const staleMember = evalBrowser("fetch('/api/members',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fullName:'Stale Review Synthetic Member'})}).then(r=>r.json())");
  assert.ok(staleMember.id);
  browser("open", `${origin}/members/${staleMember.id}`); clickButton("Prepare charge preview"); checkText("Saved charge preview");
  const staleId = new URL(evalBrowser("location.href")).searchParams.get("charge")!;
  const competing = evalBrowser(`(async () => {
    const preview = await fetch('/api/charges', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({memberId:'${staleMember.id}',planId:'${monthly.id}'})});
    if (!preview.ok) throw new Error('Competing preview failed');
    const charge = await preview.json();
    const result = await fetch('/api/payments', {method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({chargeId:charge.id,cashReceived:'1000.25'})});
    if (!result.ok) throw new Error('Competing confirmation failed');
    return result.json();
  })()`);
  browser("wait", "--fn", "document.getElementById('cash-received').disabled === false");
  clickButton("Confirm full cash"); checkText("Membership dates changed. Prepare and review a new charge before collecting cash.");
  assert.equal(evalBrowser("document.activeElement?.id"), "cash-error");
  assert.equal(evalBrowser("Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Confirm full cash')"), false);
  assert.equal(evalBrowser("Object.keys(sessionStorage).some(key => key.startsWith('cash-recovery:'))"), false);
  assert.equal(await admin.payment.count({ where: { memberId: staleMember.id } }), 1);
  audit("Stale dates require renewed review");
  clickButton("Prepare charge preview"); browser("wait", "--fn", `new URL(location.href).searchParams.get('charge') !== '${staleId}'`);
  checkText("Saved charge preview");
  const refreshedId = new URL(evalBrowser("location.href")).searchParams.get("charge")!;
  const refreshed = await admin.charge.findUniqueOrThrow({ where: { id: refreshedId } });
  assert.equal(refreshed.intendedStart.toISOString(), competing.period.endsAt);
  assertReviewedDates(refreshed);
  browser("wait", "--fn", "document.getElementById('cash-received').disabled === false");
  clickButton("Confirm full cash"); checkText("Full cash payment confirmed");
  const refreshedPayment = await admin.payment.findUniqueOrThrow({ where: { chargeId: refreshedId }, include: { period: true } });
  assert.equal(refreshedPayment.period!.startsAt.toISOString(), refreshed.intendedStart.toISOString());
  assert.equal(refreshedPayment.period!.endsAt.toISOString(), refreshed.intendedEnd.toISOString());
  assert.equal(await admin.payment.count({ where: { memberId: staleMember.id } }), 2);
  console.log("R-02 browser: displayed early-renewal dates match stored terms; queued preview denied; competing confirmation requires new review before another payment.");
  // Real permission loss after commit must retain recovery until authority returns.
  // Independent scenario; earlier owner reauth attempts must not consume its allowance.
  await admin.rateLimit.deleteMany({ where: { key: { startsWith: "identity:reauthenticate:" } } });
  browser("open", `${origin}/members`);
  const staffRecoveryMember = evalBrowser("fetch('/api/members',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fullName:'Staff Recovery Synthetic Member'})}).then(r=>r.json())");
  assert.ok(staffRecoveryMember.id);
  await admin.operator.update({ where: { id: staff.id }, data: { canCollectCash: true } });
  browser("open", origin); clickButton("Sign out"); checkText("You are signed out.");
  browser("find", "role", "radio", "click", "--name", "Staff", "--exact");
  fill("#identifier", username); fill("#password", password); clickButton("Sign in"); checkText("Welcome, Browser Staff");
  for (const duration of [30, 90, 180]) await confirmNewMembership(`Staff ${duration} Day Acceptance Member`, { id: staff.id, name: "Browser Staff" }, duration);
  browser("open", `${origin}/members/${staffRecoveryMember.id}`); clickButton("Prepare charge preview"); checkText("Saved charge preview");
  browser("wait", "--fn", "document.getElementById('cash-received').disabled === false");
  evalBrowser(`(() => {
    const send = window.fetch;
    window.fetch = async function (...args) {
      const response = await send.apply(this, args);
      if (args[0] === '/api/payments' && response.ok) { window.fetch = send; throw new TypeError('Synthetic staff lost response after commit.'); }
      return response;
    }; return true;
  })()`);
  clickButton("Confirm full cash"); checkText("Synthetic staff lost response after commit.");
  const staffOperation = recoveryRecord();
  const staffPayment = await admin.payment.findFirstOrThrow({ where: { memberId: staffRecoveryMember.id }, include: { receipt: true } });
  await admin.operator.update({ where: { id: staff.id }, data: { canCollectCash: false } });
  clickButton("Retry same confirmation"); checkText("Your account does not have permission for this action.");
  assert.deepEqual(recoveryRecord(), staffOperation);
  browser("reload"); checkText("Preparing a charge requires member access and cash collection permission"); checkText("Confirmation status unknown.");
  assert.deepEqual(recoveryRecord(), staffOperation);
  audit("Unresolved payment with revoked cash permission");
  await admin.operator.update({ where: { id: staff.id }, data: { canCollectCash: true } });
  browser("reload"); checkText("Retry same confirmation"); clickButton("Retry same confirmation"); checkText("Full cash payment confirmed"); checkText(staffPayment.reference);
  assertRefreshedMembership(staffPayment, "Browser Staff");
  assert.equal(await admin.payment.count({ where: { memberId: staffRecoveryMember.id } }), 1);
  assert.equal(await admin.membershipPeriod.count({ where: { memberId: staffRecoveryMember.id } }), 1);
  browser("open", origin); clickButton("Sign out"); checkText("You are signed out.");
  fill("#identifier", email); fill("#password", password); clickButton("Sign in"); checkText("Welcome, Browser Owner");
  fill("#reauth-password", password); clickButton("Verify password"); checkText("Password verified for five minutes.");
  console.log("R-01 browser: real 403 after committed lost response retained the key across reload; restored permission returned the original payment without duplicates.");
  const readStatuses = evalBrowser(`(async () => {
    const paths = ['/members/invalid-reference', '/receipts/invalid-reference', '/members/${browserMember.id}?charge=${latestPreviewId}&charge=${latestPreviewId}', '/members/${browserMember.id}?charge=invalid-reference'];
    return Promise.all(paths.map(path => fetch(path).then(response => response.status)));
  })()`);
  assert.deepEqual(readStatuses, [404, 404, 404, 404]);
  browser("open", `${origin}/login?signedOut=true`); checkText("You are signed out.");
  browser("open", `${origin}/login?signedOut=true&signedOut=true`); checkText("Sign in");
  assert.equal(evalBrowser("document.body.textContent.includes('You are signed out.')"), false);
  console.log("Task 5 browser: shared pricing/cash validation, real server bypass denials, preserved inputs/recovery key, correction, error focus/links and malformed route/query denials passed.");
  console.log("S-01f/g browser: owner/staff normal confirmation and same-key recovery refresh eligibility, attributed history and receipt links without navigation; success messages remain visible.");
  browser("open", origin); checkText("Welcome, Browser Owner");
  // S-03: real forms -> real API -> restricted database -> refreshed history/receipt.
  await admin.rateLimit.deleteMany();
  browser("open", `${origin}/digital`); checkText("Digital collections");
  fill("#digital-owner-password", password); clickButton("Verify password"); checkText("Password verified for five minutes.");
  const accountForm = 'form:has(input[name="action"][value="account"])';
  const grantForm = 'form:has(input[name="action"][value="verifier"])';
  for (const method of ["GCASH", "BANK"]) {
    browser("wait", "--fn", `!document.querySelector('${accountForm} button').disabled`);
    fill(`${accountForm} input[name=label]`, `Browser ${method}`); browser("select", `${accountForm} select[name=method]`, method);
    clickButton("Designate receiving account"); checkText("Saved.");
    browser("wait", "--fn", `document.querySelector('${grantForm}')?.textContent.includes('Browser ${method}')`);
  }
  const digitalAccounts = await admin.receivingAccount.findMany({ where: { gymId } });
  const accountFor = (method: string) => digitalAccounts.find(account => account.method === method)!;
  async function grantDigital(method: string, operatorId: string, active = true) {
    browser("select", `${grantForm} select[name=accountId]`, accountFor(method).id);
    browser("select", `${grantForm} select[name=operatorId]`, operatorId);
    browser("select", `${grantForm} select[name=active]`, String(active)); clickButton("Save verifier authority"); checkText("Saved.");
    browser("wait", "--fn", `!document.querySelector('${grantForm} button').disabled`);
  }
  async function recordDigitalClaim(method: string, memberName: string) {
    browser("open", `${origin}/members`); fill("#member-name", memberName); clickButton("Create member"); checkText("Member created.");
    browser("find", "role", "link", "click", "--name", memberName, "--exact"); checkText("No verified paid period is recorded.");
    browser("wait", "--fn", "document.querySelector('#charge-plan')?.disabled === false");
    clickButton("Prepare charge preview"); checkText("Saved charge preview");
    const memberId = new URL(evalBrowser("location.href")).pathname.split("/").at(-1)!;
    const at = new Date(Date.now() - 2000); const localTime = new Date(at.getTime() + 8 * 3600_000).toISOString().slice(0, 19);
    browser("select", '#digital-claim-title ~ form select[name=accountId]', accountFor(method).id);
    fill('#digital-claim-title ~ form input[name=transactionReference]', `BROWSER-${method}-${suffix}`);
    fillDateTime('#digital-claim-title ~ form input[name=reportedReceivedAt]', localTime);
    const charge = await admin.charge.findFirstOrThrow({ where: { memberId }, orderBy: { preparedAt: "desc" } });
    fill('#digital-claim-title ~ form input[name=amount]', (charge.priceCentavos / 100).toFixed(2));
    audit(`${method} pending claim form`); clickButton("Record pending transfer"); checkText("Pending digital transfer:");
    assert.equal(await admin.payment.count({ where: { memberId } }), 0);
    checkText("No verified paid period is recorded.");
    const claim = await admin.digitalClaim.findUniqueOrThrow({ where: { chargeId: charge.id } });
    return { memberId, charge, claim, localTime };
  }
  const digitalOwner = await recordDigitalClaim("GCASH", "Owner Digital Synthetic Member");
  browser("open", `${origin}/digital`); checkText("Awaiting an explicitly designated account verifier.");
  assert.equal(evalBrowser("Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Confirm full digital funds')"), false);
  await grantDigital("GCASH", owner.id);
  const ownerClaimSelector = `[data-claim="${digitalOwner.claim.id}"]`;
  browser("wait", "--fn", `!!document.querySelector('${ownerClaimSelector} input[name=amount]')`);
  fill(`${ownerClaimSelector} input[name=amount]`, "0.01");
  fill(`${ownerClaimSelector} input[name=transactionReference]`, digitalOwner.claim.transactionReference);
  fillDateTime(`${ownerClaimSelector} input[name=receivedAt]`, digitalOwner.localTime);
  fill(`${ownerClaimSelector} input[name=evidenceReference]`, `ACTIVITY-GCASH-${suffix}`);
  browser("check", `${ownerClaimSelector} input[name=accountMatched]`);
  clickButton("Confirm full digital funds"); checkText("Match the designated account"); focusedFeedback("digital-feedback");
  assert.equal(await admin.payment.count({ where: { memberId: digitalOwner.memberId } }), 0);
  assert.equal(evalBrowser(`document.querySelector('${ownerClaimSelector} input[name=transactionReference]').value`), digitalOwner.claim.transactionReference);
  assert.equal(evalBrowser(`document.querySelector('${ownerClaimSelector} input[name=evidenceReference]').value`), `ACTIVITY-GCASH-${suffix}`);
  assert.equal(evalBrowser(`document.querySelector('${ownerClaimSelector} input[name=accountMatched]').checked`), true);
  fill(`${ownerClaimSelector} input[name=amount]`, (digitalOwner.charge.priceCentavos / 100).toFixed(2));
  audit("Digital verifier confirmation form");
  evalBrowser(`(() => { const send = window.fetch; window.fetch = async function (...args) { const response = await send.apply(this, args); if (args[0] === '/api/digital' && JSON.parse(args[1].body).action === 'confirm' && response.ok) { window.fetch = send; throw new TypeError('Synthetic digital lost response after commit.'); } return response; }; return true; })()`);
  clickButton("Confirm full digital funds"); checkText("Synthetic digital lost response after commit.");
  const digitalKey = `digital-recovery:${gymId}:${owner.id}`;
  const recovery = evalBrowser(`JSON.parse(sessionStorage.getItem('${digitalKey}'))`); assert.ok(recovery.key);
  const digitalPayment = await admin.payment.findFirstOrThrow({ where: { memberId: digitalOwner.memberId }, include: { receipt: true } });
  await admin.digitalVerifier.update({ where: { accountId_operatorId: { accountId: accountFor("GCASH").id, operatorId: owner.id } }, data: { active: false } });
  clickButton("Retry original digital confirmation"); checkText("Only a designated receiving-account verifier");
  assert.deepEqual(evalBrowser(`JSON.parse(sessionStorage.getItem('${digitalKey}'))`), recovery);
  browser("reload"); checkText("Confirmation status unknown.");
  assert.deepEqual(evalBrowser(`JSON.parse(sessionStorage.getItem('${digitalKey}'))`), recovery);
  await admin.digitalVerifier.update({ where: { accountId_operatorId: { accountId: accountFor("GCASH").id, operatorId: owner.id } }, data: { active: true } });
  clickButton("Retry original digital confirmation"); checkText("Digital funds confirmed.");
  assert.equal(evalBrowser(`sessionStorage.getItem('${digitalKey}')`), null);
  assert.equal(await admin.payment.count({ where: { memberId: digitalOwner.memberId } }), 1);
  checkText("View digital receipt");
  browser("click", `${ownerClaimSelector} button`); checkText("Flagged for owner review."); checkText("Owner review required: DISPUTED");
  browser("open", `${origin}/receipts/${digitalPayment.receipt!.id}`); browser("reload");
  checkText("Digital payment receipt"); checkText("GCASH"); checkText(digitalOwner.claim.transactionReference); checkText("Owner review required: DISPUTED");
  audit("Confirmed digital receipt and review flag");
  browser("open", `${origin}/members/${digitalOwner.memberId}`); checkText("A verified paid period is in effect."); checkText(digitalPayment.reference);
  browser("open", `${origin}/digital`); browser("screenshot", resolve(".local/s03-digital-desktop.png"));
  browser("set", "viewport", "375", "812"); assert.equal(evalBrowser("document.documentElement.scrollWidth <= window.innerWidth"), true);
  audit("Digital queue and owner controls mobile"); browser("screenshot", resolve(".local/s03-digital-mobile.png")); browser("set", "viewport", "1280", "900");
  browser("open", origin); clickButton("Sign out"); checkText("You are signed out.");
  browser("find", "role", "radio", "click", "--name", "Staff", "--exact"); fill("#identifier", username); fill("#password", password); clickButton("Sign in"); checkText("Welcome, Browser Staff");
  const digitalStaff = await recordDigitalClaim("BANK", "Staff Digital Synthetic Member");
  browser("open", `${origin}/digital`); checkText("Awaiting an explicitly designated account verifier.");
  assert.equal(evalBrowser("Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Confirm full digital funds')"), false);
  browser("open", origin); clickButton("Sign out"); checkText("You are signed out.");
  fill("#identifier", email); fill("#password", password); clickButton("Sign in"); checkText("Welcome, Browser Owner");
  browser("open", `${origin}/digital`); fill("#digital-owner-password", password); clickButton("Verify password"); checkText("Password verified for five minutes.");
  await grantDigital("BANK", staff.id); await grantDigital("BANK", staff.id, false); await grantDigital("BANK", staff.id);
  browser("open", origin); clickButton("Sign out"); checkText("You are signed out.");
  browser("find", "role", "radio", "click", "--name", "Staff", "--exact"); fill("#identifier", username); fill("#password", password); clickButton("Sign in"); checkText("Welcome, Browser Staff");
  browser("open", `${origin}/digital`);
  const staffClaimSelector = `[data-claim="${digitalStaff.claim.id}"]`;
  browser("wait", "--fn", `!!document.querySelector('${staffClaimSelector} input[name=amount]')`);
  fill(`${staffClaimSelector} input[name=amount]`, (digitalStaff.charge.priceCentavos / 100).toFixed(2));
  fill(`${staffClaimSelector} input[name=transactionReference]`, digitalStaff.claim.transactionReference);
  fillDateTime(`${staffClaimSelector} input[name=receivedAt]`, digitalStaff.localTime);
  fill(`${staffClaimSelector} input[name=evidenceReference]`, `ACTIVITY-BANK-${suffix}`); browser("check", `${staffClaimSelector} input[name=accountMatched]`);
  clickButton("Confirm full digital funds"); checkText("Digital funds confirmed.");
  const bankPayment = await admin.payment.findFirstOrThrow({ where: { memberId: digitalStaff.memberId }, include: { receipt: true } });
  assert.equal(bankPayment.method, "BANK"); assert.equal(bankPayment.collectedBy, staff.id); assert.equal(bankPayment.verifiedBy, staff.id);
  browser("open", `${origin}/receipts/${bankPayment.receipt!.id}`); browser("reload"); checkText("Digital payment receipt"); checkText("BANK"); checkText(digitalStaff.claim.transactionReference);
  browser("open", `${origin}/members/${digitalStaff.memberId}`); checkText("A verified paid period is in effect."); checkText(bankPayment.reference);
  browser("set", "viewport", "375", "812"); assert.equal(evalBrowser("document.documentElement.scrollWidth <= window.innerWidth"), true); audit("Digital member history mobile"); browser("set", "viewport", "1280", "900");
  browser("open", origin); clickButton("Sign out"); checkText("You are signed out.");
  fill("#identifier", email); fill("#password", password); clickButton("Sign in"); checkText("Welcome, Browser Owner");
  fill("#reauth-password", password); clickButton("Verify password"); checkText("Password verified for five minutes.");
  console.log("S-03 browser: owner GCash/staff bank claims, explicit authority/revoke, full-funds confirmation, mismatch denial, committed lost-response/revoked-permission recovery, receipts, flags, history, mobile overflow and axe passed.");
  // S-04: preserve cases and explicit owner decisions while policy-gated money/access stays unchanged.
  await admin.rateLimit.deleteMany();
  const originalCasePayment = await admin.payment.findUniqueOrThrow({ where: { id: digitalPayment.id }, include: { period: true, receipt: true } });
  browser("find", "role", "link", "click", "--name", "Payment investigations", "--exact"); checkText("Search payment history");
  fill('input[name="reference"]', originalCasePayment.receipt!.reference); clickButton("Search confirmed payments");
  checkText("1 confirmed payment(s)."); checkText(originalCasePayment.reference); audit("Payment history search");
  browser("open", `${origin}/investigations?memberId=${digitalOwner.memberId}`);
  browser("wait", "--fn", "document.getElementById('case-memberId')?.disabled === false");
  fill("#case-summary", "Screenshot claim requires independent corroboration");
  fill("#case-evidenceReference", "https://invalid?secret=withheld"); clickButton("Open case without granting access");
  checkText("Check the case fields below."); focusedFeedback("case-feedback"); associatedError("case-evidenceReference");
  assert.equal(evalBrowser("document.getElementById('case-summary').value"), "Screenshot claim requires independent corroboration");
  audit("Investigation validation feedback"); fill("#case-evidenceReference", "CLAIM-SCREENSHOT-01");
  const caseRecoveryKey = `investigation-recovery:${gymId}:${owner.id}`;
  evalBrowser(`(() => { const send = window.fetch; window.fetch = async function (...args) { const response = await send.apply(this, args); if (args[0] === '/api/investigations' && response.ok) { window.fetch = send; throw new TypeError('Synthetic case lost response after commit.'); } return response; }; return true; })()`);
  clickButton("Open case without granting access"); checkText("Synthetic case lost response after commit.");
  const savedCase = evalBrowser(`JSON.parse(sessionStorage.getItem('${caseRecoveryKey}'))`); assert.ok(savedCase.key);
  const createdCase = await admin.investigationEvent.findUniqueOrThrow({ where: { gymId_operationKey: { gymId, operationKey: savedCase.key } } });
  browser("reload"); checkText("Case status unknown.");
  assert.deepEqual(evalBrowser(`JSON.parse(sessionStorage.getItem('${caseRecoveryKey}'))`), savedCase);
  clickButton("Retry original case operation"); checkText("Preserved investigation and decision trail");
  assert.equal(new URL(evalBrowser("location.href")).pathname, `/investigations/${createdCase.caseId}`);
  assert.equal(await admin.investigationEvent.count({ where: { caseId: createdCase.caseId } }), 1);
  assert.equal(evalBrowser(`sessionStorage.getItem('${caseRecoveryKey}')`), null);
  browser("wait", "--fn", "document.getElementById('case-reasoning')?.disabled === false");
  browser("select", "#case-action", "link"); fill("#case-reasoning", "Reference matches the existing confirmed collection"); fill("#case-evidenceReference", "MATCH-01");
  browser("select", "#case-paymentId", digitalPayment.id); clickButton("Save case record"); checkText("MATCHED");
  browser("wait", "--fn", "document.getElementById('case-reasoning')?.disabled === false");
  browser("select", "#case-action", "request"); browser("select", "#case-reason", "INCORRECT_ENTRY");
  fill("#case-reasoning", "Owner review requested; preserve access and recorded collection"); fill("#case-evidenceReference", "REQUEST-01");
  browser("select", "#case-moneyOutcome", "REFUND_PROPOSED"); fillDateTime("#case-effectiveAt", digitalOwner.localTime);
  clickButton("Save case record"); checkText("No movement requires zero PHP"); focusedFeedback("case-feedback");
  assert.equal(evalBrowser("document.getElementById('case-reasoning').value"), "Owner review requested; preserve access and recorded collection");
  assert.equal(evalBrowser("document.getElementById('case-moneyOutcome').value"), "REFUND_PROPOSED");
  assert.equal(evalBrowser(`sessionStorage.getItem('${caseRecoveryKey}')`), null, "Serialized domain rejection clears only the rejected operation");
  fill("#case-amount", "800.00"); clickButton("Save case record"); checkText("OWNER_REVIEW");
  browser("wait", "--fn", "document.getElementById('case-action')?.disabled === false");
  browser("select", "#case-action", "review"); fill("#case-owner-password", password); clickButton("Verify password"); checkText("Password verified for five minutes.");
  fill("#case-reasoning", "Reviewed the exact proposal; policy still blocks settlement"); fill("#case-evidenceReference", "OWNER-REVIEW-01"); browser("select", "#case-decision", "APPROVE");
  clickButton("Save case record"); checkText("Owner approval recorded. Execution remains blocked"); checkText("APPROVED_BLOCKED");
  const execution = evalBrowser(`fetch('/api/investigations', {method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({action:'execute',caseId:'${createdCase.caseId}'})}).then(async response=>({status:response.status,body:await response.json()}))`);
  assert.equal(execution.status, 409); assert.match(execution.body.error, /cancellation/);
  assert.deepEqual(await admin.payment.findUniqueOrThrow({ where: { id: digitalPayment.id }, include: { period: true, receipt: true } }), originalCasePayment);
  browser("screenshot", resolve(".local/s04-case-desktop.png")); audit("Investigation owner review desktop");
  browser("set", "viewport", "375", "812"); assert.equal(evalBrowser("document.documentElement.scrollWidth <= window.innerWidth"), true);
  audit("Investigation owner review mobile"); browser("screenshot", resolve(".local/s04-case-mobile.png")); browser("set", "viewport", "1280", "900");
  browser("open", `${origin}/members/${digitalOwner.memberId}`); checkText("A verified paid period is in effect.");
  browser("open", `${origin}/receipts/${originalCasePayment.receipt!.id}`); checkText(originalCasePayment.reference); checkText("View investigation and owner-review history");
  browser("open", origin); clickButton("Sign out"); checkText("You are signed out.");
  browser("find", "role", "radio", "click", "--name", "Staff", "--exact"); fill("#identifier", username); fill("#password", password); clickButton("Sign in"); checkText("Welcome, Browser Staff");
  browser("open", `${origin}/investigations/${createdCase.caseId}`); checkText("Preserved investigation and decision trail");
  assert.equal(evalBrowser("Array.from(document.querySelectorAll('#case-action option')).some(option => option.value === 'review')"), false);
  browser("select", "#case-action", "escalate"); fill("#case-reasoning", "Additional evidence needs owner attention"); fill("#case-evidenceReference", "ESCALATION-01"); clickButton("Save case record"); checkText("ESCALATED");
  const deniedCaseReview = evalBrowser(`fetch('/api/investigations', {method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({action:'execute',caseId:'${createdCase.caseId}'})}).then(response=>response.status)`);
  assert.equal(deniedCaseReview, 403); audit("Staff case escalation");
  browser("open", origin); clickButton("Sign out"); checkText("You are signed out.");
  fill("#identifier", email); fill("#password", password); clickButton("Sign in"); checkText("Welcome, Browser Owner");
  fill("#reauth-password", password); clickButton("Verify password"); checkText("Password verified for five minutes.");
  console.log("S-04 browser: history search, retained validation and rejected proposal fields, lost-response/reload case recovery, existing-payment match, explicit request/owner approval, blocked execution, preserved payment/receipt/access, staff escalation/denial, mobile overflow and axe passed.");
  // S-04 approved execution: use real browser forms/API and verify committed DB effects.
  const postSynthetic = (path: string, body: object) => {
    const result = evalBrowser(`fetch(${JSON.stringify(path)}, {method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify(${JSON.stringify(body)})}).then(async response=>({status:response.status,body:await response.json()}))`);
    assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body;
  };
  const recoveryMember = postSynthetic('/api/members', { fullName: `Omitted browser ${suffix}` });
  const recoveryPlan = await admin.plan.findFirstOrThrow({ where: { gymId, durationDays: 30 } });
  const recoveryPrice = (recoveryPlan.priceCentavos / 100).toFixed(2);
  const recoveredCase = postSynthetic('/api/investigations', { action: 'open', memberId: recoveryMember.id, reason: 'MISSING_PAYMENT', summary: 'Independently corroborated omitted synthetic cash',
    method: 'CASH', claimedAmount: recoveryPrice, originalCollectedAt: '2024-02-29T12:00:00+08:00' });
  browser('open', `${origin}/investigations/${recoveredCase.caseId}`); checkText('Preserved investigation and decision trail');
  browser('wait', '--fn', "document.getElementById('case-action')?.disabled === false");
  fill('#case-owner-password', password); clickButton('Verify password'); checkText('Password verified for five minutes.');
  browser('select', '#case-action', 'approveRecovery'); fill('#case-reasoning', 'Matched original issued receipt with independently kept cash book');
  fill('#case-evidenceReference', 'ORIGINAL-RECEIPT-01'); fill('#case-independentEvidenceReference', 'CASH-BOOK-02');
  browser('select', '#case-planId', recoveryPlan.id); browser('select', '#case-collectorId', staff.id);
  for (const name of ['independentlyVerified', 'originalDateVerified', 'omittedPaymentVerified']) browser('check', `#case-${name}`);
  clickButton('Save case record'); checkText('Awaiting separate execution; no payment recorded by this approval.');
  assert.equal(await admin.payment.count({ where: { memberId: recoveryMember.id } }), 0);
  browser('wait', '--fn', "document.getElementById('case-action')?.disabled === false");
  browser('select', '#case-action', 'recover'); fill('#case-reasoning', 'Execute the exact approved original-date recovery'); fill('#case-evidenceReference', 'RECOVERY-EXEC-01');
  // Lost response must retain the exact operation through reload/retry.
  evalBrowser(`(() => { const send = window.fetch; window.fetch = async function (...args) { const response = await send.apply(this, args); if (args[0] === '/api/investigations' && response.ok) { window.fetch = send; throw new TypeError('Synthetic recovered-payment response loss'); } return response; }; return true; })()`);
  clickButton('Save case record'); checkText('Case status unknown.'); browser('reload'); checkText('Retry original case operation'); clickButton('Retry original case operation'); checkText('Verified omitted cash payment recovered');
  const recoveredPayment = await admin.payment.findFirstOrThrow({ where: { memberId: recoveryMember.id }, include: { period: true, receipt: true } });
  assert.equal(await admin.payment.count({ where: { memberId: recoveryMember.id } }), 1);
  assert.equal(recoveredPayment.period!.startsAt.toISOString(), '2024-02-28T16:00:00.000Z');
  browser('open', `${origin}/receipts/${recoveredPayment.receipt!.id}`); checkText(recoveredPayment.reference); checkText('Recorded at');
  const excessMember = postSynthetic('/api/members', { fullName: `Excess browser ${suffix}` });
  const purchase = (memberId = excessMember.id) => { const charge = postSynthetic('/api/charges', { memberId, planId: recoveryPlan.id }); return postSynthetic('/api/payments', { chargeId: charge.id, cashReceived: recoveryPrice }); };
  const retainedPurchase = purchase(); const excessPurchase = purchase();
  const refundCase = postSynthetic('/api/investigations', { action: 'open', memberId: excessMember.id, reason: 'TWO_COLLECTIONS', summary: 'Two evidenced synthetic collections for one obligation', method: 'CASH' });
  browser('open', `${origin}/investigations/${refundCase.caseId}`); checkText('Preserved investigation and decision trail');
  browser('wait', '--fn', "document.getElementById('case-action')?.disabled === false"); browser('select', '#case-action', 'request');
  browser('select', '#case-reason', 'TWO_COLLECTIONS'); browser('select', '#case-paymentId', excessPurchase.payment.id); browser('select', '#case-relatedPaymentId', retainedPurchase.payment.id);
  browser('select', '#case-periodId', excessPurchase.period.id); browser('select', '#case-retainedPeriodId', retainedPurchase.period.id);
  browser('select', '#case-collectionCount', 'TWO'); browser('select', '#case-moneyOutcome', 'REFUND_PROPOSED'); browser('select', '#case-accessOutcome', 'ENDS');
  fill('#case-amount', recoveryPrice); fill('#case-reasoning', 'Independent records prove an unintended second collection for the same obligation');
  fill('#case-evidenceReference', 'COLLECTION-ONE-01'); fill('#case-independentEvidenceReference', 'COLLECTION-TWO-02');
  browser('check', '#case-sameObligation'); browser('check', '#case-unintendedCollection'); fillDateTime('#case-effectiveAt', new Date(Date.now() + 8 * 3600_000).toISOString().slice(0,19));
  clickButton('Save case record'); checkText('OWNER_REVIEW');
  browser('wait', '--fn', "document.getElementById('case-action')?.disabled === false"); browser('select', '#case-action', 'review');
  fill('#case-owner-password', password); clickButton('Verify password'); checkText('Password verified for five minutes.');
  fill('#case-reasoning', 'Approve full duplicate excess refund and end only the extra future term'); fill('#case-evidenceReference', 'APPROVAL-EXCESS-01'); browser('select', '#case-decision', 'APPROVE');
  clickButton('Save case record'); checkText('REVIEW \u00b7 APPROVED');
  browser('wait', '--fn', "document.getElementById('case-action')?.disabled === false"); browser('select', '#case-action', 'executeApproved');
  fill('#case-reasoning', 'Execute exact approved full excess disposition'); fill('#case-evidenceReference', 'EXEC-REFUND-01'); fill('#case-independentEvidenceReference', 'EXEC-REFUND-02'); browser('check', '#case-independentlyVerified');
  clickButton('Save case record'); checkText('AWAITING_SETTLEMENT');
  assert.equal((await admin.effectiveEntitlement.findUniqueOrThrow({ where: { periodId: excessPurchase.period.id } })).isCurrentProjection, false);
  assert.equal(await admin.investigationEvent.count({ where: { caseId: refundCase.caseId, kind: 'SETTLE' } }), 0);
  browser('wait', '--fn', "document.getElementById('case-action')?.disabled === false"); browser('select', '#case-action', 'settle');
  fill('#case-reasoning', 'Actual external synthetic cash return independently verified'); fill('#case-evidenceReference', 'REFUND-RECEIPT-01'); fill('#case-independentEvidenceReference', 'REFUND-CASH-BOOK-02'); browser('check', '#case-independentlyVerified');
  browser('wait', '--fn', `Date.now() >= ${Date.now() + 1000}`);
  fill('#case-amount', recoveryPrice); fill('#case-settlementReference', `EXTERNAL-REFUND-${suffix}`); fillDateTime('#case-settledAt', new Date(Date.now() + 8 * 3600_000).toISOString().slice(0,19));
  clickButton('Save case record'); checkText('External settlement independently verified:');
  assert.equal(await admin.investigationEvent.count({ where: { caseId: refundCase.caseId, kind: 'SETTLE' } }), 1);
  audit('S-04 verified refund settlement'); browser('set', 'viewport', '375', '812');
  assert.equal(evalBrowser('document.documentElement.scrollWidth <= window.innerWidth'), true); audit('S-04 execution mobile');
  browser('screenshot', resolve('.local/s04-execution-mobile.png')); browser('set', 'viewport', '1280', '900');
  browser('open', `${origin}/receipts/${excessPurchase.receipt.id}`); checkText(excessPurchase.payment.reference); checkText('External refund settlement verified');
  const correctionMember = postSynthetic('/api/members', { fullName: `Correction browser ${suffix}` });
  const correctionPurchase = purchase(correctionMember.id);
  const correctionCase = postSynthetic('/api/investigations', { action: 'open', memberId: correctionMember.id, reason: 'INCORRECT_ENTRY', summary: 'Independently verified synthetic entry correction', method: 'CASH' });
  const correctionEnd = new Date().toISOString();
  const correctionRequest = postSynthetic('/api/investigations', { action: 'request', caseId: correctionCase.caseId, expectedRevision: 1,
    reasoning: 'Correct entry with no money movement and explicit end of access', evidenceReference: 'CORRECTION-01', independentEvidenceReference: 'CORRECTION-02',
    reason: 'INCORRECT_ENTRY', paymentId: correctionPurchase.payment.id, periodId: correctionPurchase.period.id, collectionCount: 'UNKNOWN', amount: '0', method: 'CASH',
    moneyOutcome: 'NO_MOVEMENT', accessOutcome: 'ENDS', effectiveAt: correctionEnd });
  postSynthetic('/api/investigations', { action: 'review', caseId: correctionCase.caseId, expectedRevision: 2, requestEventId: correctionRequest.id,
    reasoning: 'Approve exact zero-money correction and access end', evidenceReference: 'CORRECTION-APPROVAL', decision: 'APPROVE' });
  browser('open', `${origin}/investigations/${correctionCase.caseId}`); checkText('Preserved investigation and decision trail');
  browser('wait', '--fn', "document.getElementById('case-action')?.disabled === false"); browser('select', '#case-action', 'executeApproved');
  fill('#case-reasoning', 'Execute approved zero-money correction'); fill('#case-evidenceReference', 'CORRECTION-EXEC-01'); fill('#case-independentEvidenceReference', 'CORRECTION-EXEC-02'); browser('check', '#case-independentlyVerified');
  clickButton('Save case record'); checkText('Zero money movement; correction completed.');
  assert.equal((await admin.effectiveEntitlement.findUniqueOrThrow({ where: { periodId: correctionPurchase.period.id } })).endsAt.toISOString(), correctionEnd);
  browser('open', `${origin}/members/${correctionMember.id}`); checkText('The most recent verified paid period has expired.');
  console.log('S-04 approved execution browser: owner recovery approval, original-date recovery, committed lost-response retry, immutable receipt, exact excess refund approval/execution, explicit access end, separate verified external settlement, mobile and axe passed.');
  // S-05: pre-existing historical registry is synthetic setup; all recovery uses the real UI/API.
  await admin.rateLimit.deleteMany();
  const outageAt = new Date(Date.now() - 2 * 86400_000);
  const outageIssue = new Date(outageAt.getTime() + 1000);
  const outageH1 = new Date(outageAt.getTime() + 3600_000);
  const outageH2 = new Date(outageAt.getTime() + 7200_000);
  const outageBook = await admin.outageBook.create({ data: { gymId, code: `HIST${suffix.toUpperCase()}`, firstNumber: 1, lastNumber: 4,
    custodianId: staff.id, createdBy: owner.id, createdAt: new Date(outageAt.getTime() - 86400_000) } });
  const outagePrice = await admin.outagePrice.create({ data: { gymId, bookId: outageBook.id, planId: recoveryPlan.id, planName: recoveryPlan.name,
    durationDays: recoveryPlan.durationDays, priceCentavos: recoveryPlan.priceCentavos, planVersion: recoveryPlan.version } });
  const outageMember = postSynthetic('/api/members', { fullName: `Outage D plus Two ${suffix}` });
  const ownerOutageMember = postSynthetic('/api/members', { fullName: `Owner Outage ${suffix}` });
  const phtValue = (date: Date) => new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0,19);
  const outageReady = () => browser('wait', '--fn', "document.getElementById('outage-action')?.disabled === false");
  browser('open', `${origin}/outage-receipts`); checkText('Outage receipts and custody'); outageReady();
  fill('#outage-owner-password', password); clickButton('Verify password'); checkText('Password verified for five minutes.');
  browser('select', '#outage-action', 'register'); fill('#outage-code', `OWN${suffix.toUpperCase()}`); fill('#outage-first', '1'); fill('#outage-last', '3');
  browser('select', '#outage-custodianId', owner.id); clickButton('Save outage record'); checkText('Outage record saved.'); outageReady();
  const ownerBook = await admin.outageBook.findUniqueOrThrow({ where: { gymId_code: { gymId, code: `OWN${suffix.toUpperCase()}` } } });
  const ownerPrice = await admin.outagePrice.findFirstOrThrow({ where: { bookId: ownerBook.id, durationDays: 30 } });
  for (const operatorId of [owner.id, staff.id]) {
    browser('select', '#outage-action', 'verifier'); browser('select', '#outage-operatorId', operatorId); browser('select', '#outage-active', 'true');
    clickButton('Save outage record'); checkText('Outage record saved.'); outageReady();
  }
  // Owner collector/entrant; staff independently verifies later.
  browser('select', '#outage-action', 'enter'); browser('select', '#outage-bookId', ownerBook.id);
  clickButton('Save outage record'); checkText('Check the outage fields below.'); focusedFeedback('outage-feedback');
  associatedError('outage-number'); associatedError('outage-memberId'); audit('S-05 entry validation');
  browser('find', 'role', 'link', 'click', '--name', 'Check this field. Use the recorded full amount, identity, reference or actual PHT time. (number)', '--exact');
  assert.equal(evalBrowser('document.activeElement.id'), 'outage-number');
  fill('#outage-number','1'); fill('#outage-memberId',ownerOutageMember.id); browser('select','#outage-priceId',ownerPrice.id); fill('#outage-amount',recoveryPrice);
  browser('select','#outage-collectorId',owner.id);
  // datetime-local records whole seconds; leave enough margin after millisecond registry creation.
  browser('wait','--fn',`Date.now() >= ${ownerBook.createdAt.getTime()+2100}`);
  const ownerCollectedAt = new Date();
  fillDateTime('#outage-collectedAt',phtValue(ownerCollectedAt)); fillDateTime('#outage-issuedAt',phtValue(ownerCollectedAt));
  fill('#outage-receiptReference',`OWNER-PAPER-${suffix}`); fill('#outage-cashReference',`OWNER-CASH-${suffix}`); browser('check','#outage-historyCertain');
  clickButton('Save outage record'); checkText('Paper receipt entered pending verification.'); outageReady();
  const ownerEntry = await admin.outageEntry.findUniqueOrThrow({ where: { bookId_number: { bookId:ownerBook.id, number:1 } } });
  assert.equal(await admin.payment.count({where:{memberId:ownerOutageMember.id}}),0);
  browser('select','#outage-action','handover'); browser('select','#outage-toId',staff.id);
  fillDateTime('#outage-actualAt',phtValue(new Date())); fill('#outage-used','1'); fill('#outage-unused','2,3'); fill('#outage-cashHeld',recoveryPrice); fill('#outage-cashTransferred','0');
  fill('#outage-transferReference',`OWNER-NO-TRANSFER-${suffix}`); fill('#outage-evidenceReference',`OWNER-SIGNED-${suffix}`); fill('#outage-outstanding','One pending paper receipt; no difference cleared'); browser('check','#outage-bothSigned');
  clickButton('Save outage record'); checkText('Outage record saved.'); outageReady(); audit('S-05 owner registry and pending recovery');
  browser('screenshot',resolve('.local/s05-owner-desktop.png'));
  browser('open',origin); clickButton('Sign out'); checkText('You are signed out.'); browser('find','role','radio','click','--name','Staff','--exact');
  fill('#identifier',username); fill('#password',password); clickButton('Sign in'); checkText('Welcome, Browser Staff');
  browser('open',`${origin}/outage-receipts`); outageReady(); browser('select','#outage-action','verify'); browser('select','#outage-bookId',ownerBook.id); browser('select','#outage-entryId',ownerEntry.id);
  fill('#outage-receiptEvidence',`OWNER-RETAINED-${suffix}`); fill('#outage-cashEvidence',`OWNER-COUNT-${suffix}`); fill('#outage-custodyEvidence',`OWNER-HANDOVER-${suffix}`); browser('check','#outage-independentlyMatched');
  clickButton('Save outage record'); checkText('Outage receipt independently verified.'); outageReady();
  // Simulated paper operation and shift handovers continue while the application is disconnected.
  browser('set','offline','on');
  try { assert.equal(evalBrowser("fetch('/api/outage').then(()=>false).catch(()=>true)"),true); }
  finally { browser('set','offline','off'); }
  browser('select','#outage-action','enter'); browser('select','#outage-bookId',outageBook.id);
  fill('#outage-number','1'); fill('#outage-memberId',outageMember.id); browser('select','#outage-priceId',outagePrice.id); fill('#outage-amount','0.01');
  browser('select','#outage-collectorId',staff.id); fillDateTime('#outage-collectedAt',phtValue(outageAt)); fillDateTime('#outage-issuedAt',phtValue(outageIssue));
  fill('#outage-receiptReference',`PAPER-${suffix}`); fill('#outage-cashReference',`CASH-${suffix}`); browser('check','#outage-historyCertain'); browser('check','#outage-hasVisit');
  fillDateTime('#outage-visitAt',phtValue(outageIssue)); browser('select','#outage-visitAuthorizerId',staff.id); fill('#outage-visitReference',`ORIGINAL-VISIT-${suffix}`);
  clickButton('Save outage record'); checkText('Full cash must match'); outageReady();
  assert.equal(await admin.outageEntry.count({where:{bookId:outageBook.id}}),0); assert.equal(evalBrowser('document.getElementById("outage-memberId").value'),outageMember.id);
  fill('#outage-amount',recoveryPrice); clickButton('Save outage record'); checkText('Paper receipt entered pending verification.'); outageReady();
  const outageEntry = await admin.outageEntry.findUniqueOrThrow({where:{bookId_number:{bookId:outageBook.id,number:1}}});
  assert.equal(await admin.payment.count({where:{memberId:outageMember.id}}),0);
  for (const [actualAt,toId] of [[outageH1,owner.id],[outageH2,staff.id]] as const) {
    browser('select','#outage-action','handover'); browser('select','#outage-toId',toId); fillDateTime('#outage-actualAt',phtValue(actualAt));
    fill('#outage-used','1'); fill('#outage-unused','2'); fill('#outage-void','3'); fill('#outage-missing','4'); fill('#outage-cashHeld',recoveryPrice); fill('#outage-cashTransferred','0');
    fill('#outage-transferReference',`NO-TRANSFER-${actualAt.getTime()}`); fill('#outage-evidenceReference',`SIGNED-${actualAt.getTime()}`); fill('#outage-outstanding','Void 3 retained; missing 4 escalated to owner; payment still pending'); browser('check','#outage-bothSigned');
    clickButton('Save outage record'); checkText('Evidence preserved for owner review.'); outageReady();
  }
  browser('select','#outage-action','exception'); fill('#outage-number','1'); browser('select','#outage-kind','LOST_COPY'); fillDateTime('#outage-actualAt',phtValue(outageH2));
  fill('#outage-memberId',outageMember.id); fill('#outage-evidenceReference',`LOST-MEMBER-COPY-${suffix}`); fill('#outage-reasoning','Retained booklet copy and independent cash and custody evidence preserved');
  clickButton('Save outage record'); checkText('Evidence preserved for owner review.'); outageReady();
  browser('select','#outage-action','verify'); browser('select','#outage-entryId',outageEntry.id);
  fill('#outage-receiptEvidence','SELF-RECEIPT'); fill('#outage-cashEvidence','SELF-CASH'); fill('#outage-custodyEvidence','SELF-CUSTODY'); browser('check','#outage-independentlyMatched');
  clickButton('Save outage record'); checkText('A designated verifier independent of both collector and entrant is required.'); outageReady();
  assert.equal(await admin.payment.count({where:{memberId:outageMember.id}}),0);
  browser('set','viewport','375','812'); assert.equal(evalBrowser('document.documentElement.scrollWidth <= window.innerWidth'),true); audit('S-05 staff pending mobile');
  browser('screenshot',resolve('.local/s05-staff-mobile.png')); browser('set','viewport','1280','900');
  browser('open',`${origin}/members/${outageMember.id}`); checkText('Pending verification; no new normal entitlement'); checkText('No second visit authorized by this receipt.');
  browser('open',origin); clickButton('Sign out'); checkText('You are signed out.'); fill('#identifier',email); fill('#password',password); clickButton('Sign in'); checkText('Welcome, Browser Owner');
  browser('open',`${origin}/outage-receipts`); outageReady(); browser('select','#outage-action','verify'); browser('select','#outage-bookId',outageBook.id); browser('select','#outage-entryId',outageEntry.id);
  fill('#outage-receiptEvidence',`RETAINED-${suffix}`); fill('#outage-cashEvidence',`COUNT-${suffix}`); fill('#outage-custodyEvidence',`HANDOVER-${suffix}`); browser('check','#outage-independentlyMatched');
  evalBrowser(`(() => { const send=window.fetch; window.fetch=async function(input,init) { if(input==='/api/outage' && init?.method==='POST') { window.fetch=send; await send.call(this,input,init); throw new Error('Synthetic lost outage response'); } return send.call(this,input,init); }; return true; })()`);
  clickButton('Save outage record'); checkText('A saved verify operation may have committed.');
  const outageSaved = JSON.parse(evalBrowser(`sessionStorage.getItem('outage-recovery:${gymId}:${owner.id}')`));
  const outageCommitted = await admin.outageEvent.findUniqueOrThrow({where:{gymId_operationKey:{gymId,operationKey:outageSaved.key}}});
  browser('reload'); checkText('Retrieve saved outage operation'); clickButton('Retrieve saved outage operation'); checkText('Outage receipt independently verified.'); outageReady();
  assert.equal(await admin.payment.count({where:{memberId:outageMember.id}}),1); assert.equal(await admin.outageEntry.count({where:{bookId:outageBook.id}}),1);
  const outageResult = outageCommitted.result as {paymentId:string;receiptId:string};
  const outagePayment = await admin.payment.findUniqueOrThrow({where:{id:outageResult.paymentId},include:{period:true}});
  const outageDate = new Date(outageAt.getTime()+8*3600_000).toISOString().slice(0,10);
  assert.equal(outagePayment.period!.startsAt.toISOString(),new Date(`${outageDate}T00:00:00+08:00`).toISOString());
  assert.equal(outagePayment.enteredAt.getTime(),outageEntry.enteredAt.getTime());
  browser('set','viewport','375','812'); assert.equal(evalBrowser('document.documentElement.scrollWidth <= window.innerWidth'),true); audit('S-05 verified owner mobile');
  browser('screenshot',resolve('.local/s05-verified-mobile.png')); browser('set','viewport','1280','900');
  browser('open',`${origin}/receipts/${outageResult.receiptId}`); checkText(`Original controlled paper receipt ${outageBook.code}-1`); checkText('Separate original provisional visit'); audit('S-05 linked receipt');
  browser('open',`${origin}/members/${outageMember.id}`); checkText('Independently verified; see linked payment history'); checkText('A verified paid period is in effect.');
  console.log('S-05 browser PASS: owner registry/designation/entry, independent staff verification, offline paper fixture recovery across two shifts, staff validation/partial/self-verification denial, lost-copy investigation, pending visit separation, original-date owner verification, lost-response/reload replay, linked history/receipt, keyboard, 375px and axe.');
  browser('open', origin); checkText('Welcome, Browser Owner');
  fill('#reauth-password',password); clickButton('Verify password'); checkText('Password verified for five minutes.');
  alterIdentityRequest("reset-staff", { operatorId: "invalid-reference" }); clickButton("Send reset link");
  checkText("Check the account fields and try again."); focusedFeedback("operator-feedback");
  assert.equal(evalBrowser(`document.getElementById('reset-staff-${staff.id}').getAttribute('aria-describedby')`), `operator-error-${staff.id}`);
  audit("Staff reset validation errors");
  clickButton("Send reset link"); checkText("Link captured for the recipient.");
  const resetUrl = await capturedUrl(staff.id);
  clickButton("Disable staff"); alterIdentityRequest("disable", { operatorId: "invalid-reference" }); clickButton("Confirm disable");
  checkText("Check the account fields and try again."); focusedFeedback("operator-feedback");
  assert.equal((await admin.operator.findUniqueOrThrow({ where: { id: staff.id } })).state, "ACTIVE");
  audit("Disable validation errors");
  clickButton("Confirm disable"); checkText("Staff disabled.");
  browser("open", resetUrl); fill("#password", password); fill("#confirmation", password); clickButton("Save private password"); checkText("Link expired, replaced, or already used.");
  browser("find", "role", "link", "click", "--name", "Back to sign in", "--exact");
  console.log("Browser flow: owner setup, replay denial, wrong-password denial, owner/staff login, invite, reauth, reset initiation, disable, and disabled-link denial passed.");
  assert.equal(evalBrowser(`JSON.stringify([localStorage, sessionStorage]).includes(${JSON.stringify(password)})`), false);
  console.log("R-06/08 browser: client validation, real server rejection, field associations, summary focus/keyboard links, retained non-secret values/selections, cleared passwords and corrected retries passed for all identity actions.");
} catch (error) {
  try {
    console.log("Browser failure state:", evalBrowser("({path:location.pathname,buttons:Array.from(document.querySelectorAll('button')).map(button=>({text:button.textContent,disabled:button.disabled})),feedback:['cash-error','digital-feedback','claim-feedback','case-feedback','outage-feedback'].map(id=>({id,text:document.getElementById(id)?.textContent}))})"));
    browser("screenshot", resolve(".local/browser-failure.png"));
  } catch { /* Preserve the original failure if the browser is unavailable. */ }
  primaryFailure = error;
  throw error;
} finally {
  try { browser("close"); }
  catch (error) { if (!primaryFailure) throw error; }
  finally { await db.$disconnect(); await admin.$disconnect(); }
}
