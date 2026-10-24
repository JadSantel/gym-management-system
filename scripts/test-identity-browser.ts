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

assertSynthetic();
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
async function confirmNewMembership(memberName: string, collector: { id: string; name: string }) {
  const member = evalBrowser(`fetch('/api/members', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fullName:${JSON.stringify(memberName)}})}).then(r=>r.json())`);
  assert.ok(member.id);
  browser("open", `${origin}/members/${member.id}`); checkText("No verified paid period is recorded.");
  clickButton("Prepare charge preview"); checkText("Saved charge preview");
  browser("wait", "--fn", "document.getElementById('cash-received').disabled === false");
  clickButton("Confirm full cash"); checkText("Full cash payment confirmed");
  const payment = await admin.payment.findFirstOrThrow({ where: { memberId: member.id }, include: { receipt: true } });
  assert.equal(payment.collectedBy, collector.id);
  assertRefreshedMembership(payment, collector.name);
  assert.equal(await admin.payment.count({ where: { memberId: member.id } }), 1);
  assert.equal(await admin.membershipPeriod.count({ where: { memberId: member.id } }), 1);
}
async function capturedUrl(operatorId: string) {
  const invitation = await admin.invitation.findFirstOrThrow({ where: { operatorId, consumedAt: null, sentAt: { not: null } }, orderBy: { createdAt: "desc" } });
  return JSON.parse(readFileSync(resolve(".local/mailbox", `${invitation.id}.json`), "utf8")).url as string;
}

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
  fill("#password", password); fill("#confirmation", password);
  clickButton("Save private password"); checkText("Your password is ready");
  browser("open", `${origin}/login`); browser("open", ownerUrl); fill("#password", password); fill("#confirmation", password);
  clickButton("Save private password"); checkText("Link expired, replaced, or already used.");
  browser("open", `${origin}/login`);
  fill("#identifier", email); fill("#password", "incorrect password"); clickButton("Sign in"); checkText("Unable to sign in.");
  fill("#password", password); clickButton("Sign in"); checkText("Welcome, Browser Owner");
  browser("find", "role", "link", "click", "--name", "Plans and pricing", "--exact"); checkText("Set up the approved catalogue");
  clickButton("Apply approved catalogue"); checkText("Verify your password again before this action.");
  fill("#pricing-password", password); clickButton("Verify password"); checkText("Password verified for five minutes.");
  clickButton("Apply approved catalogue"); checkText("Current catalogue");
  const monthly = await admin.plan.findFirstOrThrow({ where: { gymId, durationDays: 30 } });
  fill(`#price-${monthly.id}`, "800.001");
  assert.equal(evalBrowser(`document.getElementById('price-${monthly.id}').checkValidity()`), false);
  fill(`#price-${monthly.id}`, "800.00"); audit("Plan pricing");
  browser("open", origin); checkText("Welcome, Browser Owner");
  fill("#reauth-password", password); clickButton("Verify password"); checkText("Password verified for five minutes.");
  fill("#staff-name", "Browser Staff"); fill("#staff-username", username); fill("#staff-email", staffEmail);
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
  browser("check", "input[name=members]"); browser("check", "input[name=cash]"); clickButton("Save permissions"); checkText("Staff permissions saved.");
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
  await confirmNewMembership("Owner Immediate Refresh Member", { id: owner.id, name: "Browser Owner" });
  // Review a real early renewal, then verify the displayed dates against PostgreSQL.
  browser("open", `${origin}/members/${browserMember.id}`); clickButton("Prepare charge preview"); checkText("Saved charge preview");
  const renewalId = new URL(evalBrowser("location.href")).searchParams.get("charge")!;
  const renewal = await admin.charge.findUniqueOrThrow({ where: { id: renewalId } });
  assert.equal(renewal.intendedStart.toISOString(), browserPayment.period!.endsAt.toISOString());
  const pht = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  function assertReviewedDates(charge: { intendedStart: Date; intendedEnd: Date }) {
    for (const [label, date] of [["Proposed start (inclusive)", charge.intendedStart], ["Proposed end (exclusive)", charge.intendedEnd]] as const) {
      const shown = evalBrowser(`Array.from(document.querySelectorAll('dt')).find(node => node.textContent === '${label}').nextElementSibling.textContent`);
      assert.equal(shown, `${pht.format(date)} PHT`);
    }
  }
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
  await confirmNewMembership("Staff Immediate Refresh Member", { id: staff.id, name: "Browser Staff" });
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
  console.log("S-01f/g browser: owner/staff normal confirmation and same-key recovery refresh eligibility, attributed history and receipt links without navigation; success messages remain visible.");
  browser("open", origin); checkText("Welcome, Browser Owner");
  clickButton("Send reset link"); checkText("Link captured for the recipient.");
  const resetUrl = await capturedUrl(staff.id);
  clickButton("Disable staff"); clickButton("Confirm disable"); checkText("Staff disabled.");
  browser("open", resetUrl); fill("#password", password); fill("#confirmation", password); clickButton("Save private password"); checkText("Link expired, replaced, or already used.");
  browser("find", "role", "link", "click", "--name", "Back to sign in", "--exact");
  console.log("Browser flow: owner setup, replay denial, wrong-password denial, owner/staff login, invite, reauth, reset initiation, disable, and disabled-link denial passed.");
} finally {
  try { browser("close"); } finally { await db.$disconnect(); await admin.$disconnect(); }
}
