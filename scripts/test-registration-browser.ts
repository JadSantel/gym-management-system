import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
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
function theme(value: string) { browser("wait", "--fn", "!!document.querySelector('header time')?.getAttribute('datetime')"); click("Appearance"); browser("wait", '[role="dialog"]'); click(value); browser("wait", "--fn", "document.getAnimations().every(animation => animation.playState !== 'running')"); }
function audit(label: string) {
  assert.equal(evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `${label} overflow`);
  const results = JSON.parse(browser("a11y", "--tags", "wcag2a,wcag2aa", "--json")).data;
  assert.equal(results.counts.violations, 0, `${label}: ${JSON.stringify(results.violations)}`);
  assert.equal(results.counts.incomplete, 0, `${label}: ${JSON.stringify(results.incomplete)}`);
}
function capture(label: string) { evaluate("scrollTo(0,0); true"); browser("screenshot", resolve(output, `${label}.png`), "--full"); }
async function post(path: string, body: unknown, owner?: Headers, overrides?: Record<string, string>) {
  return fetch(origin + path, { method: "POST", headers: { "content-type": "application/json", origin, ...(owner ? { cookie: owner.get("cookie")! } : {}), ...overrides }, body: JSON.stringify(body) });
}
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
  const httpInput = { fullName: "HTTP Synthetic Visitor", email: `http-visitor-${suffix}@example.test`, phone: "09171234560", requestId: randomUUID() };
  assert.equal((await post(`/api/join/${code}`, { ...httpInput, gymId: randomUUID() })).status, 400);
  assert.equal((await post(`/api/join/${code}`, httpInput, undefined, { origin: "https://foreign.test" })).status, 403);
  for (let i = 0; i < 2; i++) assert.deepEqual(await (await post(`/api/join/${code}`, httpInput)).json(), { status: "PENDING" });
  assert.equal((await fetch(`${origin}/api/members/directory`)).status, 401);
  assert.equal((await post(`/api/members/${randomUUID()}/contacts`, {})).status, 401);
  browser("open", link.url); text("Join Synthetic Registration Gym");
  for (const appearance of ["Light", "Dark"]) {
    theme(appearance);
    for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1000], ["phone", 375, 900]] as const) {
      browser("set", "viewport", String(width), String(height)); audit(`${appearance} join ${device}`); capture(`${appearance.toLowerCase()}-join-${device}`);
    }
  }
  click("Save my profile"); text("Check the highlighted details.");
  assert.equal(evaluate("document.activeElement.getAttribute('role')"), "alert");
  assert.equal(evaluate("document.querySelectorAll('input[aria-invalid=true]').length"), 3); audit("registration errors"); capture("dark-join-errors-phone");
  browser("fill", "#join-name", `Browser Visitor ${suffix}`); browser("fill", "#join-email", `visitor-${suffix}@example.test`); browser("fill", "#join-phone", "09171234567");
  browser("network", "route", "**/api/join/**", "--abort"); click("Save my profile"); text("Registration not confirmed.");
  assert.equal(evaluate("document.getElementById('join-name').disabled"), true);
  browser("network", "unroute"); click("Retry same submission"); text("Your profile is saved");
  assert.equal(evaluate("document.activeElement.getAttribute('role')"), "status"); audit("Pending confirmation"); capture("dark-pending-phone");
  const visitor = await admin.member.findFirstOrThrow({ where: { gymId, email: `visitor-${suffix}@example.test` } });
  assert.equal(await admin.effectiveEntitlement.count({ where: { memberId: visitor.id } }), 0);
  browser("open", link.url); text("Save my profile");
  browser("fill", "#join-name", "Duplicate Browser Visitor"); browser("fill", "#join-email", `visitor-${suffix}@example.test`); browser("fill", "#join-phone", "09171234568");
  click("Save my profile"); text("Please speak to reception"); audit("duplicate referral");
  browser("open", `${origin}/login`); text("Sign in");
  browser("fill", "#identifier", email); browser("fill", "#password", password); click("Sign in");
  browser("wait", "--url", `${origin}/`);
  browser("open", `${origin}/members`); text("Reception registration QR");
  const active = await fetch(`${origin}/api/registration-link`, { headers: owner }); assert.equal(active.status, 200); assert.equal((await active.json()).url, link.url);
  for (const appearance of ["Light", "Dark"]) {
    theme(appearance);
    for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1000], ["phone", 375, 900]] as const) {
      browser("set", "viewport", String(width), String(height)); audit(`${appearance} members ${device}`); capture(`${appearance.toLowerCase()}-members-${device}`);
    }
  }
  browser("fill", "#search-name", `Browser Visitor ${suffix}`); text(`visitor-${suffix}@example.test`); text("+639171234567");
  browser("open", `${origin}/members/${visitor.id}`); text("Public registration");
  browser("fill", "#profile-email", `edited-${suffix}@example.test`); browser("fill", "#profile-phone", "bad"); click("Save contacts"); text("Check the contact fields.");
  browser("fill", "#profile-phone", "+639171234567"); click("Save contacts"); text("Contacts saved as unverified.");
  browser("reload"); browser("wait", "--fn", `document.getElementById('profile-email')?.value === ${JSON.stringify(`edited-${suffix}@example.test`)}`);
  for (const appearance of ["Light", "Dark"]) {
    theme(appearance);
    for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1000], ["phone", 375, 900]] as const) {
      browser("set", "viewport", String(width), String(height)); audit(`${appearance} profile ${device}`); capture(`${appearance.toLowerCase()}-profile-${device}`);
    }
  }
  browser("open", `${origin}/members`); text("Replace registration link"); click("Replace registration link"); text("Registration link ready.");
  assert.equal((await post(`/api/join/${code}`, { ...httpInput, requestId: randomUUID() })).status, 410);
  browser("open", link.url); text("Registration unavailable"); audit("expired link"); capture("dark-expired-phone");
  console.log("Registration browser/HTTP PASS: three surfaces x Light/Dark x desktop/tablet/phone; axe, errors/focus, network retry, Pending/no entitlement, duplicate referral, staff contacts/reload, QR replacement and expired-link denial.");
} finally { try { browser("close"); } finally { await db.$disconnect(); await admin.$disconnect(); } }
