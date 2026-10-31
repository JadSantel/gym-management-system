import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { assertSynthetic } from "../src/lib/email";
import { bootstrapSyntheticOwner, completeSetup, reauthenticate, inviteStaff, setCapabilities } from "../src/lib/identity";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { createMember } from "../src/lib/members";
import { changePlans } from "../src/lib/plans";
import { prepareCharge, confirmCash } from "../src/lib/charges";
import { digitalCommand } from "../src/lib/digital";
import { investigationCommand } from "../src/lib/investigations";
assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic");
}
const origin = process.env.BETTER_AUTH_URL!;
assert.equal(origin, "http://127.0.0.1:3000");
const binary = resolve(".local/browser-tools/agent-browser-win32-x64.exe");
const session = `gym-prototype-${randomUUID().slice(0, 8)}`;
const output = resolve(".local/prototype-ui"); mkdirSync(output, { recursive: true });
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }) });
const suffix = randomUUID().slice(0, 8);
const email = `prototype-${suffix}@example.test`;
const password = "Synthetic prototype password 2026!";
let token = "";
const sender = { async send(message: { url: string }) { token = new URL(message.url).hash.slice(1); } };
function browser(...args: string[]) {
  const result = spawnSync(binary, ["--session", session, ...args], { encoding: "utf8", windowsHide: true, timeout: 45_000 });
  if (result.status !== 0) throw new Error(`Prototype browser step '${args[0]}' failed; output withheld to protect credentials.`);
  return result.stdout;
}
function evaluate(code: string) { return JSON.parse(browser("eval", code, "--json")).data.result; }
function click(name: string) { browser("find", "role", "button", "click", "--name", name, "--exact"); }
function text(value: string) { browser("wait", "--text", value); }
function audit(label: string) {
  assert.equal(evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `${label} overflow`);
  const result = JSON.parse(browser("a11y", "--tags", "wcag2a,wcag2aa", "--json")).data;
  if (result.incomplete?.some((item: { id: string }) => item.id === "aria-hidden-focus") && evaluate("!!document.querySelector('[role=dialog]')")) {
    browser("focus", '[role="dialog"] button:has-text("Close")'); browser("press", "Tab");
    assert.equal(evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)"), true);
    browser("press", "Shift+Tab"); assert.equal(evaluate("document.activeElement.textContent"), "Close");
    result.counts.incomplete -= result.incomplete.filter((item: { id: string }) => item.id === "aria-hidden-focus").length;
    console.log(`${label}: aria-hidden-focus manual review PASS (Tab/Shift+Tab wrap).`);
  }
  if (result.counts.violations || result.counts.incomplete) console.log(JSON.stringify({ label, violations: result.violations, incomplete: result.incomplete }));
  assert.equal(result.counts.violations, 0, `${label} violations`); assert.equal(result.counts.incomplete, 0, `${label} incomplete`);
}
let failure: unknown;
try {
  const gymId = randomUUID();
  await bootstrapSyntheticOwner({ gymId, gymName: "Synthetic Form & Function", name: "Alex Prototype", email }, sender, admin);
  await completeSetup(token, password);
  const response = await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ email, password }) }));
  assert.equal(response.status, 200);
  const owner = new Headers({ cookie: response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ") });
  await reauthenticate(owner, password);
  const plans = await changePlans(owner, { action: "initialize" });
  const monthly = plans.find(plan => plan.durationDays === 30)!;
  const fixture = [];
  for (const name of ["Maria Santos", "John Reyes", "Ana Cruz", "Carlo Lim", "Lea Mendoza", "Paolo Garcia"]) fixture.push(await createMember(owner, { fullName: name }));
  for (const member of [fixture[0], fixture[2], fixture[4]]) {
    const charge = await prepareCharge(owner, member.id, monthly.id);
    await confirmCash(owner, charge.id, "800.00", randomUUID());
  }
  const next = await prepareCharge(owner, fixture[2].id, monthly.id);
  await confirmCash(owner, next.id, "800.00", randomUUID());
  await digitalCommand(owner, { action: "account", label: "Synthetic receiving account", method: "GCASH" });
  const account = await admin.receivingAccount.findFirstOrThrow({ where: { gymId } });
  const digitalCharge = await prepareCharge(owner, fixture[1].id, monthly.id);
  await digitalCommand(owner, { action: "claim", chargeId: digitalCharge.id, accountId: account.id, amount: "800.00", transactionReference: `PENDING-${suffix}`, reportedReceivedAt: new Date(Date.now() - 2000).toISOString() });
  await investigationCommand(owner, { action: "open", memberId: fixture[1].id, reason: "MISSING_PAYMENT", summary: "Unverified transfer claim requires evidence review", method: "GCASH", evidenceReference: `SYNTHETIC-${suffix}` }, randomUUID());
  await inviteStaff(owner, { name: "Prototype Staff", username: `prototype_${suffix}`, email: `prototype-staff-${suffix}@example.test` }, sender);
  await completeSetup(token, password);
  const staff = await admin.operator.findFirstOrThrow({ where: { gymId, role: "STAFF" } });
  await setCapabilities(owner, staff.id, { canManageMembers: true, canCollectCash: false });
  browser("open", `${origin}/login`); browser("fill", "#identifier", email); browser("fill", "#password", password); click("Sign in"); text("Welcome, Alex Prototype");
  assert.equal(evaluate("document.querySelector('main').textContent.includes('3,200.00')"), true);
  const paths: string[][] = [["overview", "/"], ["operate", "/operate"], ["members", "/members"], ["profile", `/members/${fixture[2].id}`], ["payment", `/members/${fixture[5].id}?charge=${(await prepareCharge(owner, fixture[5].id, monthly.id)).id}`], ["transactions", "/transactions"], ["exceptions", "/investigations"], ["closing", "/closing"], ["digital", "/digital"], ["team", "/team"], ["plans", "/plans"], ["outage", "/outage-receipts"], ["pilot", "/pilot"], ["receipt", `/receipts/${(await admin.paymentReceipt.findFirstOrThrow({ where: { gymId } })).id}`], ["case", `/investigations/${(await admin.investigationCase.findFirstOrThrow({ where: { gymId } })).id}`]];
  for (const theme of ["light", "dark"]) {
    browser("select", 'select[aria-label="Appearance"]', theme);
    for (const [name, path] of paths.filter(([name]) => !process.argv.includes("--review-only") || ["profile", "payment"].includes(name))) {
      browser("open", `${origin}${path}`); browser("wait", "--fn", "document.fonts.status === 'loaded'");
      assert.equal(evaluate("document.documentElement.classList.contains('dark')"), theme === "dark");
      if (name === "profile") assert.equal(evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Renew membership')?.disabled && document.querySelector('#charge-plan').disabled"), true);
      if (name === "payment") browser("wait", "--fn", "document.activeElement?.id === 'charge-title'");
      for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1024], ["phone", 375, 812]] as const) {
        browser("set", "viewport", String(width), String(height)); audit(`${theme} ${name} ${device}`);
        if (device !== "desktop" && evaluate("window.scrollY") !== 0) console.log("Frame geometry", evaluate("(() => { const app=document.querySelector('.app-workspace'),main=document.getElementById('main'); return {width:innerWidth,height:innerHeight,rootY:scrollY,rootHeight:document.documentElement.scrollHeight,bodyHeight:document.body.scrollHeight,appHeight:app.getBoundingClientRect().height,mainHeight:main.getBoundingClientRect().height,mainScroll:main.scrollTop,mainOverflow:getComputedStyle(main).overflowY,appOverflow:getComputedStyle(app).overflow,visualHeight:visualViewport.height}; })()"));
        if (device !== "desktop") assert.equal(evaluate("window.scrollY"), 0, `${name} outer page scroll after resize`);
        evaluate(name === "payment" ? "(() => { const heading=document.getElementById('charge-title'),main=document.getElementById('main'); if(getComputedStyle(main).overflowY==='auto') main.scrollTop += heading.getBoundingClientRect().top-main.getBoundingClientRect().top-24; else heading.scrollIntoView({block:'start'}); return true; })()" : "window.scrollTo(0,0); true");
        if (device !== "desktop") assert.equal(evaluate("(() => { const nav=document.querySelector('nav[aria-label=\"Quick navigation\"]'),main=document.getElementById('main'); return Math.abs(nav.getBoundingClientRect().bottom-innerHeight)<1 && main.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top+1 && scrollY===0; })()"), true, `${name} navigation frame`);
        if (device !== "tablet") browser("screenshot", resolve(output, `${theme}-${name}-${device}-viewport.png`));
        browser("screenshot", resolve(output, `${theme}-${name}-${device}.png`), "--full");
      }
      console.log(`${theme} ${name}: desktop/tablet/phone, overflow, axe PASS`);
    }
  }
  browser("set", "viewport", "1440", "1000"); browser("open", `${origin}${paths.find(([name]) => name === "payment")![1]}`);
  text("Saved charge preview");
  assert.equal(await admin.payment.count({ where: { memberId: fixture[5].id } }), 0);
  click("Review cash payment"); text("Confirm only after receiving the full cash amount.");
  assert.equal(await admin.payment.count({ where: { memberId: fixture[5].id } }), 0, "Review never records a collection");
  audit("Cash review before confirmation"); browser("screenshot", resolve(output, "dark-cash-review-desktop.png"));
  click("Back to payment"); click("GCash"); text("Record transfer claim"); audit("Digital claim method selection");
  browser("screenshot", resolve(output, "dark-digital-claim-desktop.png"));
  browser("set", "viewport", "375", "812"); browser("open", `${origin}/transactions`); click("Pending verification"); text(`PENDING-${suffix.toUpperCase()}`);
  assert.equal(evaluate("document.querySelectorAll('tbody tr').length"), 1);
  browser("fill", "#transaction-search", "No matching transaction"); text("No transactions match this view."); audit("Empty transaction filter");
  browser("open", `${origin}/members`); browser("fill", "#search-name", "Nobody with this name"); click("Search"); text("No matching members."); audit("Empty member search");
  browser("fill", "#search-name", "Ana Cruz"); click("Search"); text("Paid next term scheduled"); click("Expired"); text("No members match this filter.");
  browser("open", `${origin}/operate`); browser("focus", '[data-sidebar="trigger"]'); browser("press", "Enter");
  browser("wait", '[role="dialog"]'); audit("Mobile keyboard navigation");
  browser("press", "Escape"); browser("wait", "--fn", "!document.querySelector('[role=dialog]')");
  browser("set", "viewport", "320", "812"); audit("320px front desk reflow");
  browser("set", "viewport", "375", "812"); browser("open", `${origin}/members/${fixture[0].id}`);
  browser("select", "#legacy-action", "review"); browser("check", "#legacy-independentlyChecked");
  assert.equal(evaluate("document.getElementById('legacy-independentlyChecked').checked"), true);
  assert.equal(evaluate("(() => { const box=document.getElementById('legacy-independentlyChecked').getBoundingClientRect(),nav=document.querySelector('nav[aria-label=\"Quick navigation\"]').getBoundingClientRect(); return box.top>=0 && box.bottom<=nav.top && scrollY===0; })()"), true, "Mobile historical review checkbox stays above navigation");
  audit("Mobile historical review checkbox"); browser("screenshot", resolve(output, "dark-legacy-checkbox-phone.png"));
  click("Sign out"); text("You are signed out."); browser("find", "role", "radio", "click", "--name", "Staff", "--exact"); browser("fill", "#identifier", `prototype_${suffix}`); browser("fill", "#password", password); click("Sign in"); text("Welcome, Prototype Staff");
  assert.equal(new URL(evaluate("location.href")).pathname, "/operate");
  click("Toggle Sidebar"); browser("wait", '[role="dialog"]');
  assert.equal(evaluate("document.querySelector('nav[aria-label=\"Main navigation\"]')?.textContent.includes('Team & access')"), false);
  browser("press", "Escape"); browser("wait", "--fn", "!document.querySelector('[role=dialog]')");
  browser("open", `${origin}/members/${fixture[0].id}`); text("Preparing a charge requires member access and cash collection permission"); audit("Staff member profile permission state");
  await setCapabilities(owner, staff.id, { canManageMembers: false, canCollectCash: false });
  for (const path of ["/", "/operate", "/members", "/transactions", "/team"]) {
    browser("open", `${origin}${path}`); text("Your account");
    assert.equal(evaluate("document.querySelector('main').textContent.includes('Maria Santos')"), false);
  }
  assert.equal(evaluate("fetch('/api/members').then(response => response.status)"), 403);
  console.log("Transaction/member filters, empty states, keyboard, 320px reflow, staff landing, denied cash preparation and immediate capability revocation PASS.");
} catch (error) { try { browser("screenshot", resolve(output, "failure.png"), "--full"); } catch {} failure = error; }
finally {
  try { browser("close"); } catch (error) { failure ??= error; }
  await admin.$disconnect(); await db.$disconnect();
}
if (failure) throw failure;
