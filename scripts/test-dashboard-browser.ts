import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { assertSynthetic } from "../src/lib/email";
import { bootstrapSyntheticOwner, completeSetup, reauthenticate, inviteStaff, setCapabilities } from "../src/lib/identity";
import { changePlans } from "../src/lib/plans";
import { createMember } from "../src/lib/members";
import { prepareCharge, confirmCash, confirmOnline } from "../src/lib/charges";
import { workspaceOverview } from "../src/lib/workspace";
import { formatPhp } from "../src/lib/money";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import pg from "pg";

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic");
}
const origin = "http://127.0.0.1:3000", suffix = randomUUID().slice(0, 8), session = `dashboard-${suffix}`;
assert.equal(process.env.BETTER_AUTH_URL, origin);
const before = process.argv.includes("--before");
const output = resolve(".impeccable/review/dashboard", before ? "before" : "after"); mkdirSync(output, { recursive: true });
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
const password = "Synthetic dashboard password 2026!", email = `dashboard-${suffix}@example.test`;
function browser(...args: string[]): string {
  const r = spawnSync(resolve(".local/browser-tools/agent-browser-win32-x64.exe"), ["--session", session, ...args], { encoding: "utf8", windowsHide: true, timeout: 45000 });
  if (r.status !== 0) throw new Error(`Browser ${args[0]} failed: ${r.stderr}`);
  if (args[0] === "open") browser("wait", "--load", "load");
  if (args[0] === "reload") {
    browser("wait", "--load", "load");
    if (!before) browser("wait", "--fn", "document.querySelectorAll('#recent-title').length===1 && !document.querySelector('[aria-label=\"Loading dashboard\"]')");
  }
  if (args[0] === "screenshot" && args[1]) { const file = r.stdout.match(/Screenshot saved to (.+)/)?.[1]?.trim(); if (file && file !== args[1]) copyFileSync(file, args[1]); }
  return r.stdout;
}
const evaluate = (code: string) => JSON.parse(browser("eval", code, "--json")).data.result;
const click = (name: string) => browser("find", "role", "button", "click", "--name", name, "--exact");
const text = (value: string) => browser("wait", "--text", value);
function audit(label: string) {
  assert.equal(evaluate("document.documentElement.scrollWidth<=innerWidth && document.querySelector('#main').scrollWidth<=document.querySelector('#main').clientWidth"), true, `${label} overflow`);
  const result = JSON.parse(browser("a11y", "--tags", "wcag2a,wcag2aa", "--json")).data;
  assert.deepEqual(result.violations, [], `${label} axe violations`);
  assert.deepEqual(result.incomplete, [], `${label} axe incompletes`);
}
function capture(name: string) {
  evaluate("(async()=>{document.getElementById('main')?.scrollTo(0,0);await document.fonts.ready;return true})()");
  if (!before) audit(name);
  browser("screenshot", resolve(output, `${name}.png`), "--full");
  if (!before && /(?:empty|populated)$/.test(name) && /(?:tablet|phone|narrow)/.test(name)) {
    for (const [section, selector] of [["collections", "#collections-title"], ["payments", "#recent-title"]]) {
      evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'});true`); browser("screenshot", resolve(output, `${name}-${section}.png`));
    }
  }
}
async function signIn(identifier: string, mode = "email") {
  const response = await auth.handler(new Request(`${origin}/api/auth/sign-in/${mode}`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ [mode]: identifier, password }) }));
  assert.equal(response.status, 200);
  return new Headers({ cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") });
}
try {
  await admin.rateLimit.deleteMany();
  const gymId = randomUUID(); let setup = "";
  const sender = { async send(message: { url: string }) { setup = new URL(message.url).hash.slice(1); } };
  await bootstrapSyntheticOwner({ gymId, gymName: "Synthetic Dashboard Gym", name: "Dashboard Owner", email }, sender, admin);
  await completeSetup(setup, password);
  const owner = await signIn(email); await reauthenticate(owner, password);
  const [plan] = await changePlans(owner, { action: "initialize" });
  browser("open", `${origin}/login`); browser("fill", "#identifier", email); browser("fill", "#password", password); click("Sign in"); browser("wait", "--url", `${origin}/`);
  text("Welcome, Dashboard Owner");
  for (const state of ["empty", "populated"]) {
    if (state === "populated") {
      for (const method of ["Cash", "GCash", "GoTyme", "MariBank"]) {
        const member = await createMember(owner, { fullName: `Synthetic ${method} Member` });
        const charge = await prepareCharge(owner, member.id, plan.id);
        if (method === "Cash") await confirmCash(owner, charge.id, "800.00", randomUUID());
        else await confirmOnline(owner, { chargeId: charge.id, amount: "800.00", provider: method as "GCash" | "GoTyme" | "MariBank", transactionReference: `SYNTHETIC-${randomUUID()}`, fundsChecked: true }, randomUUID());
        if (method === "Cash") await admin.attendanceVisit.create({ data: { gymId, memberId: member.id, arrivedAt: new Date(), day: new Date(new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)) } });
      }
      const pending = await createMember(owner, { fullName: "Synthetic Prepared Only" });
      await prepareCharge(owner, pending.id, plan.id);
      browser("reload"); text("Synthetic MariBank Member");
    }
    for (const theme of ["Light", "Dark"]) {
      click("Appearance"); click(theme); browser("reload"); text("Welcome, Dashboard Owner");
      assert.equal(evaluate("document.documentElement.classList.contains('dark')"), theme === "Dark");
      for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1000], ["phone", 390, 900], ["narrow", 320, 900]] as const) {
        browser("set", "viewport", String(width), String(height));
        assert.equal(evaluate("document.documentElement.scrollWidth<=innerWidth && document.querySelector('#main').scrollWidth<=document.querySelector('#main').clientWidth"), true, `${state} ${theme} ${device} overflow`);
        if (!before) {
          assert.equal(evaluate("document.querySelectorAll('#dashboard-summary [data-slot=card]').length"), 3);
        }
        capture(`${theme.toLowerCase()}-${device}-${state}`);
      }
    }
  }
  if (!before) {
    const data = await workspaceOverview(owner), today = data.days.at(-1)!;
    assert.equal(today.amount, 320000); assert.equal(today.count, 4);
    assert.equal(data.activeMembers, 4);
    assert.equal(evaluate(`document.querySelector('#dashboard-summary').innerText.includes(${JSON.stringify(formatPhp(today.amount))})`), true);
    browser("set", "viewport", "1440", "1000");
    evaluate("document.querySelector('#collection-details summary').focus();true"); browser("press", "Enter");
    assert.equal(evaluate("document.querySelector('#collection-details').open"), true);
    assert.equal(evaluate("document.querySelectorAll('#collection-details tbody tr').length"), 7);
    assert.equal(evaluate("getComputedStyle(document.activeElement).outlineStyle!=='none'"), true);
    browser("press", "Tab"); capture("dark-desktop-daily-details");
    const receipt = data.payments[0].receipt!;
    browser("click", `#recent-payments a[href='/receipts/${receipt.id}']`); browser("wait", "--url", `${origin}/receipts/${receipt.id}`); text("800.00");
    browser("open", origin); text("Welcome, Dashboard Owner");
    for (const [label, href, expected] of [["Find a member", "/members#search-name", "Members"], ["Record payment", "/members#search-name", "Members"], ["Open scanner", "/attendance/scanner", "Scanner"]]) {
      browser("click", `#dashboard-actions a[aria-label='${label}']`); browser("wait", "--url", `${origin}${href}`); text(expected); browser("open", origin); text("Welcome, Dashboard Owner");
    }
    evaluate("document.querySelector('#dashboard-actions a').focus();true"); browser("press", "Tab");
    assert.equal(evaluate("document.activeElement.getAttribute('aria-label')"), "Find a member");
    browser("press", "Tab"); assert.equal(evaluate("document.activeElement.getAttribute('aria-label')"), "Open scanner");
    click("Appearance"); click("System"); browser("reload");
    assert.equal(evaluate("localStorage.getItem('gym-appearance')==='system' && document.documentElement.classList.contains('dark')===matchMedia('(prefers-color-scheme: dark)').matches"), true);
    // Hold only a local read lock: the real query streams its fallback, then exceeds
    // Prisma's transaction deadline. Release in finally; no data/permissions change.
    const blocker = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
    await blocker.connect();
    try {
      for (const theme of ["Light", "Dark"]) {
        click("Appearance"); click(theme);
        await blocker.query("BEGIN");
        await blocker.query("LOCK TABLE payments IN ACCESS EXCLUSIVE MODE");
        const lockedAt = Date.now();
        try {
          evaluate("setTimeout(()=>location.reload(),0);true"); text("Loading today's snapshot");
          for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1000], ["phone", 390, 900], ["narrow", 320, 900]] as const) {
            browser("set", "viewport", String(width), String(height)); capture(`${theme.toLowerCase()}-${device}-loading`);
          }
          await new Promise(resolve => setTimeout(resolve, Math.max(0, 6000 - (Date.now() - lockedAt))));
        } finally { await blocker.query("ROLLBACK"); }
        text("Dashboard could not be loaded");
        assert.equal(evaluate("!!document.querySelector('[role=alert]') && !document.querySelector('#dashboard-summary')"), true);
        for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1000], ["phone", 390, 900], ["narrow", 320, 900]] as const) {
          browser("set", "viewport", String(width), String(height)); capture(`${theme.toLowerCase()}-${device}-error`);
        }
        click("Retry dashboard"); text("Synthetic MariBank Member");
      }
    } finally { await blocker.query("ROLLBACK"); await blocker.end(); }
    await inviteStaff(owner, { name: "Dashboard Staff", email: `dashboard-staff-${suffix}@example.test`, username: `dash_${suffix}` }, sender);
    await completeSetup(setup, password);
    const staff = await admin.operator.findFirstOrThrow({ where: { gymId, role: "STAFF" } });
    const staffHeaders = await signIn(`dash_${suffix}`, "username");
    await assert.rejects(workspaceOverview(staffHeaders), { status: 403 });
    browser("cookies", "clear"); browser("open", `${origin}/login`);
    browser("find", "role", "radio", "click", "--name", "Staff", "--exact");
    browser("fill", "#identifier", `dash_${suffix}`); browser("fill", "#password", password); click("Sign in");
    browser("wait", "--url", `${origin}/team`);
    browser("open", origin); browser("wait", "--url", `${origin}/team`);
    await setCapabilities(owner, staff.id, { canManageMembers: true, canCollectCash: true });
    browser("open", origin); browser("wait", "--url", `${origin}/members`);
    assert.equal(evaluate("!!document.querySelector('#dashboard-summary')"), false);
    browser("cookies", "clear"); browser("open", origin); browser("wait", "--url", `${origin}/login`);
  }
  console.log(before ? "PASS: incumbent dashboard captures, both themes at 1440/768/390/320, empty and populated." : "PASS: dashboard empty/populated/loading/error Light/Dark at 1440/768/390/320, real query failure/retry, theme reload, axe, overflow, totals, daily details, receipts, workflow links and owner/staff/anonymous routes.");
} finally {
  try { browser("close"); } finally { await db.$disconnect(); await admin.$disconnect(); }
}
