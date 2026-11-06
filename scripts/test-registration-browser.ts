import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { assertSynthetic } from "../src/lib/email";
import { bootstrapSyntheticOwner, completeSetup, reauthenticate } from "../src/lib/identity";
import { registrationLink } from "../src/lib/registration";
import { changePlans } from "../src/lib/plans";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";

assertSynthetic();
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }) });
const origin = "http://127.0.0.1:3000";
const session = `registration-${randomUUID().slice(0, 8)}`;
const binary = resolve(".local/browser-tools/agent-browser-win32-x64.exe");
const output = resolve(".impeccable/review/registration"); mkdirSync(output, { recursive: true });
const suffix = randomUUID().slice(0, 8);
const email = `registration-browser-${suffix}@example.test`;
const password = "Synthetic registration browser 2026!";
function browser(...args: string[]) {
  const result = spawnSync(binary, ["--session", session, ...args], { encoding: "utf8", windowsHide: true, timeout: 45000 });
  if (result.status !== 0) throw new Error(`Registration browser ${args[0]} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}
const evaluate = (code: string) => JSON.parse(browser("eval", code, "--json")).data.result;
const click = (name: string) => browser("find", "role", "button", "click", "--name", name, "--exact");
const text = (value: string) => browser("wait", "--text", value);
function open(url: string) { browser("open", url); browser("wait", "--load", "load"); }
function theme(value: string) { browser("wait", "button[aria-label='Appearance']"); click("Appearance"); browser("wait", '[role="dialog"]'); click(value); browser("wait", "--fn", "document.getAnimations().every(animation => animation.playState !== 'running')"); }
function memberPage() {
  assert.equal(evaluate("!!document.querySelector('[data-member-page=registration]')"), true, "Dedicated member registration layout");
  assert.equal(evaluate("!!document.querySelector('.app-workspace, [data-sidebar], .mobile-bottom-nav, header time')"), false, "Public registration never inherits CRM chrome");
  assert.equal(evaluate("document.title"), "Member registration");
}
function audit(label: string) {
  assert.equal(evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `${label} overflow`);
  let results = JSON.parse(browser("a11y", "--tags", "wcag2a,wcag2aa", "--json")).data;
  if (results.counts.incomplete) {
    evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))");
    results = JSON.parse(browser("a11y", "--tags", "wcag2a,wcag2aa", "--json")).data;
  }
  assert.equal(results.counts.violations, 0, `${label}: ${JSON.stringify(results.violations)}`);
  assert.equal(results.counts.incomplete, 0, `${label}: ${JSON.stringify(results.incomplete)}`);
}
function capture(label: string, viewport = false) {
  evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))");
  const result = viewport ? browser("screenshot") : browser("screenshot", "--full");
  const path = result.match(/Screenshot saved to (.+)/)?.[1]?.trim();
  assert.ok(path, "Browser must report the actual capture path");
  copyFileSync(path, resolve(output, `${label}.png`));
}
async function post(path: string, body: unknown, owner?: Headers, overrides?: Record<string, string>) {
  return fetch(origin + path, { method: "POST", headers: { "content-type": "application/json", origin, ...(owner ? { cookie: owner.get("cookie")! } : {}), ...overrides }, body: JSON.stringify(body) });
}
let failure: unknown;
try {
  await admin.rateLimit.deleteMany();
  const gymId = randomUUID(); let token = "";
  await bootstrapSyntheticOwner({ gymId, gymName: "Synthetic Registration Gym", name: "Registration Reviewer", email }, { async send(message) { token = new URL(message.url).hash.slice(1); } }, admin);
  await completeSetup(token, password);
  const login = await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ email, password }) }));
  assert.equal(login.status, 200);
  const owner = new Headers({ cookie: login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") });
  await reauthenticate(owner, password); await changePlans(owner, { action: "initialize" });
  const link = await registrationLink(owner, true); assert.ok(link);
  const code = new URL(link.url).pathname.split("/").pop()!;
  // Actual HTTP boundary checks (not an in-process route invocation).
  const httpInput = { fullName: "HTTP Synthetic Visitor", email: `http-visitor-${suffix}@example.test`, phone: "09171234560", password, confirmation: password, requestId: randomUUID() };
  assert.equal((await post(`/api/join/${code}`, { ...httpInput, gymId: randomUUID() })).status, 400);
  assert.equal((await post(`/api/join/${code}`, httpInput, undefined, { origin: "https://foreign.test" })).status, 403);
  for (let i = 0; i < 2; i++) assert.deepEqual(await (await post(`/api/join/${code}`, httpInput)).json(), { status: "PENDING" });
  assert.equal((await fetch(`${origin}/api/members/directory`)).status, 401);
  assert.equal((await post(`/api/members/${randomUUID()}/contacts`, {})).status, 401);
  open(link.url); text("Join Synthetic Registration Gym"); memberPage();
  for (const appearance of ["Light", "Dark"]) {
    theme(appearance);
    for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1000], ["phone", 375, 900]] as const) {
      browser("set", "viewport", String(width), String(height)); audit(`${appearance} join ${device}`); capture(`${appearance.toLowerCase()}-join-${device}`);
    }
  }
  console.log("Join Light/Dark desktop/tablet/phone matrix PASS.");
  browser("focus", "#join-name"); browser("press", "Tab");
  assert.equal(evaluate("document.activeElement.id"), "join-email");
  browser("press", "Tab"); assert.equal(evaluate("document.activeElement.id"), "join-phone");
  browser("press", "Tab"); assert.equal(evaluate("document.activeElement.id"), "join-password");
  browser("press", "Tab"); assert.equal(evaluate("document.activeElement.id"), "join-confirmation");
  click("Save my profile"); text("Check the highlighted details.");
  assert.equal(evaluate("document.activeElement.getAttribute('role')"), "alert");
  assert.equal(evaluate("document.querySelectorAll('input[aria-invalid=true]').length"), 5); audit("registration errors"); capture("dark-join-errors-phone");
  browser("fill", "#join-name", `Browser Visitor ${suffix}`); browser("fill", "#join-email", `visitor-${suffix}@example.test`); browser("fill", "#join-phone", "09171234567");
  browser("fill", "#join-password", password); browser("fill", "#join-confirmation", password + "mismatch");
  click("Save my profile"); text("Passwords must match."); audit("registration password mismatch"); capture("dark-password-mismatch-phone");
  browser("fill", "#join-confirmation", password);
  browser("find", "label", "Show passwords", "check"); assert.equal(evaluate("document.getElementById('join-password').type"), "text");
  browser("find", "label", "Show passwords", "click"); assert.equal(evaluate("document.getElementById('join-password').type"), "password");
  browser("network", "route", "**/api/join/**", "--abort"); click("Save my profile"); text("Registration not confirmed.");
  assert.equal(evaluate("document.getElementById('join-name').disabled"), true);
  browser("network", "unroute"); click("Retry same submission"); text("Your profile is saved");
  browser("wait", "--fn", "document.activeElement.getAttribute('role') === 'status'");
  assert.equal(evaluate("document.activeElement.getAttribute('role')"), "status"); audit("Pending confirmation"); capture("dark-pending-phone");
  const visitor = await admin.member.findFirstOrThrow({ where: { gymId, email: `visitor-${suffix}@example.test` } });
  assert.equal(await admin.effectiveEntitlement.count({ where: { memberId: visitor.id } }), 0);
  text("Pending activation"); text("What happens next?"); text("Your member login is ready.");
  assert.equal(evaluate("document.querySelectorAll('input[type=password]').length"), 0);
  for (const appearance of ["Light", "Dark"]) {
    theme(appearance); audit(`${appearance} Pending confirmation`); capture(`${appearance.toLowerCase()}-pending-phone`);
  }
  open(link.url); text("Save my profile");
  browser("fill", "#join-name", "Duplicate Browser Visitor"); browser("fill", "#join-email", `visitor-${suffix}@example.test`); browser("fill", "#join-phone", "09171234568");
  browser("fill", "#join-password", password); browser("fill", "#join-confirmation", password);
  click("Save my profile"); text("Please speak to reception"); audit("duplicate referral");
  open(`${origin}/login`); text("Sign in");
  browser("fill", "#identifier", email); browser("fill", "#password", password); click("Sign in");
  browser("wait", "--url", `${origin}/`);
  text("Welcome, Registration Reviewer");
  open(link.url); text("Join Synthetic Registration Gym"); memberPage();
  for (const appearance of ["Light", "Dark"]) {
    theme(appearance); audit(`${appearance} public form with operator session`); capture(`${appearance.toLowerCase()}-join-signed-in-phone`);
  }
  open(`${origin}/attendance`); text("New member QR");
  assert.equal(evaluate("!!document.querySelector('.app-workspace')"), true, "Operator workspace keeps its original shell");
  browser("find", "role", "link", "click", "--name", "New member QR", "--exact");
  browser("wait", "#registration-link");
  assert.equal(evaluate("location.pathname + location.hash"), "/attendance/scanner#registration-link");
  assert.equal(evaluate("document.querySelector('#registration-link img').getAttribute('src')"), link.qr, "Scanner shares the existing gym registration QR");
  assert.equal(evaluate("document.querySelector('#registration-link a').href"), link.url);
  for (const appearance of ["Light", "Dark"]) {
    theme(appearance);
    browser("reload"); browser("wait", "#registration-link");
    assert.equal(evaluate("document.documentElement.classList.contains('dark')"), appearance === "Dark");
    for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1000], ["small-phone", 320, 900], ["phone", 375, 900]] as const) {
      browser("set", "viewport", String(width), String(height));
      assert.equal(evaluate("Math.abs(document.querySelector('#registration-link img').getBoundingClientRect().width - document.querySelector('#registration-link img').getBoundingClientRect().height) < 1"), true, "Reception QR stays square on narrow phones");
      evaluate("document.getElementById('registration-link').scrollIntoView({block:'start'}); true"); audit(`${appearance} scanner registration ${device}`); capture(`${appearance.toLowerCase()}-scanner-registration-${device}`, true);
      browser("scrollintoview", "a[download='reception-registration.png']"); capture(`${appearance.toLowerCase()}-scanner-registration-actions-${device}`, true);
    }
  }
  theme("System"); browser("set", "media", "light"); browser("reload"); browser("wait", "#registration-link img");
  assert.equal(evaluate("document.documentElement.classList.contains('dark')"), false);
  browser("set", "media", "dark"); browser("reload"); browser("wait", "#registration-link img");
  assert.equal(evaluate("document.documentElement.classList.contains('dark')"), true);
  theme("Dark");
  browser("focus", "#registration-link a"); browser("press", "Tab");
  assert.equal(evaluate("document.activeElement.getAttribute('download')"), "reception-registration.png");
  browser("press", "Tab"); assert.equal(evaluate("document.activeElement.textContent"), "Replace registration link");
  browser("network", "route", "**/api/registration-link", "--abort"); click("Replace registration link"); text("Link update not confirmed.");
  assert.equal(evaluate("document.activeElement.getAttribute('role')"), "status");
  assert.equal(evaluate("document.querySelector('#registration-link img') === null"), true, "Uncertain replacement never shares a potentially revoked QR");
  audit("uncertain registration QR"); capture("dark-scanner-registration-uncertain-phone", true);
  browser("network", "unroute"); click("Reload registration QR"); browser("wait", "#registration-link img");
  console.log("Attendance shortcut, shared QR, scanner Light/Dark device matrix, persisted themes, keyboard and failed replacement recovery PASS.");
  open(`${origin}/members`); browser("wait", "#search-name");
  browser("scrollintoview", "#registration-link-title"); text("New here? Scan to join.");
  const active = await fetch(`${origin}/api/registration-link`, { headers: owner }); assert.equal(active.status, 200); assert.equal((await active.json()).url, link.url);
  for (const appearance of ["Light", "Dark"]) {
    theme(appearance);
    for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1000], ["phone", 375, 900]] as const) {
      browser("set", "viewport", String(width), String(height));
      evaluate("document.getElementById('main').scrollTop=0; true");
      audit(`${appearance} members ${device}`); capture(`${appearance.toLowerCase()}-members-${device}`);
      browser("scrollintoview", "#registration-link-title"); capture(`${appearance.toLowerCase()}-reception-${device}`);
      if (device === "phone") { browser("scrollintoview", "a[download='reception-registration.png']"); capture(`${appearance.toLowerCase()}-reception-actions-phone`); }
    }
  }
  console.log("Members Light/Dark desktop/tablet/phone matrix PASS.");
  browser("fill", "#search-name", `Browser Visitor ${suffix}`); text(`visitor-${suffix}@example.test`); text("+639171234567");
  open(`${origin}/members/${visitor.id}`); browser("wait", "#profile-email");
  browser("scrollintoview", "#contact-title"); text("Public registration");
  browser("fill", "#profile-email", `edited-${suffix}@example.test`); browser("fill", "#profile-phone", "bad"); click("Save contacts"); text("Check the contact fields.");
  browser("fill", "#profile-phone", "+639171234567"); click("Save contacts"); text("Contacts saved as unverified.");
  browser("reload"); browser("wait", "--fn", `document.getElementById('profile-email')?.value === ${JSON.stringify(`edited-${suffix}@example.test`)}`);
  for (const appearance of ["Light", "Dark"]) {
    theme(appearance);
    for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1000], ["phone", 375, 900]] as const) {
      browser("set", "viewport", String(width), String(height));
      evaluate("document.getElementById('main').scrollTop=0; true");
      audit(`${appearance} profile ${device}`); capture(`${appearance.toLowerCase()}-profile-${device}`);
      browser("scrollintoview", "#contact-title"); capture(`${appearance.toLowerCase()}-contacts-${device}`);
    }
  }
  console.log("Profile Light/Dark desktop/tablet/phone matrix PASS.");
  browser("scrollintoview", "#membership-payment"); click("Prepare charge preview"); text("Saved charge preview");
  browser("fill", "#cash-received", "799.00"); click("Review cash payment"); click("Confirm full cash");
  browser("wait", "#cash-error");
  assert.equal(await admin.payment.count({ where: { memberId: visitor.id } }), 0, "Short cash creates no payment");
  assert.equal(await admin.effectiveEntitlement.count({ where: { memberId: visitor.id } }), 0, "Short cash grants no access");
  click("Back to payment"); browser("fill", "#cash-received", "800.00"); click("Review cash payment");
  assert.equal(await admin.payment.count({ where: { memberId: visitor.id } }), 0, "Review creates no payment");
  click("Confirm full cash"); text("Full cash payment confirmed");
  assert.equal(await admin.payment.count({ where: { memberId: visitor.id } }), 1);
  const receipt = await admin.paymentReceipt.findFirstOrThrow({ where: { payment: { memberId: visitor.id } } });
  open(`${origin}/members/${visitor.id}`); text("Eligible for normal admission");
  browser("scrollintoview", "#member-payments"); text(receipt.reference);
  open(`${origin}/receipts/${receipt.id}`); text("Cash payment receipt"); text(receipt.reference); audit("public registration cash receipt");
  capture("dark-registration-cash-receipt-phone");
  console.log("Public registration through exact full cash, durable receipt and current eligibility PASS.");
  open(`${origin}/attendance/scanner`); browser("scrollintoview", "#registration-link-title"); text("Replace registration link"); click("Replace registration link"); text("Registration link ready.");
  assert.equal((await post(`/api/join/${code}`, { ...httpInput, requestId: randomUUID() })).status, 410);
  open(link.url); text("Registration unavailable"); memberPage(); audit("expired link"); capture("dark-expired-phone");
  await admin.registrationLink.updateMany({ where: { gymId, revokedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
  open(`${origin}/attendance/scanner`); browser("scrollintoview", "#registration-link-title"); text("No active registration link.");
  assert.equal(evaluate("document.querySelector('#registration-link img') === null"), true); audit("expired registration QR hidden"); capture("dark-scanner-registration-empty-phone", true);
  click("Create registration link"); text("Registration link ready.");
  const renewed = await registrationLink(owner); assert.ok(renewed);
  assert.equal(evaluate("document.querySelector('#registration-link a').href"), renewed.url);
  open(`${origin}/members#registration-link`); browser("wait", "#registration-link img");
  assert.equal(evaluate("document.querySelector('#registration-link a').href"), renewed.url, "Members shares the link issued at Scanner");
  console.log("Registration browser/HTTP PASS: three surfaces x Light/Dark x desktop/tablet/phone; axe, errors/focus, network retry, Pending/no entitlement, duplicate referral, staff contacts/reload, QR replacement and expired-link denial.");
} catch (error) { failure = error; try { capture("failure"); } catch {} }
finally {
  try { browser("close"); } catch (error) { failure ??= error; }
  await db.$disconnect(); await admin.$disconnect();
}
if (failure) throw failure;
