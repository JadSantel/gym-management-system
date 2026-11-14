import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { assertSynthetic } from "../src/lib/email";
import { bootstrapSyntheticOwner, completeSetup, inviteStaff } from "../src/lib/identity";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { changePlans } from "../src/lib/plans";
import { dayStart, manilaDay, manilaMonthRange } from "../src/lib/attendance-schema";
import { DAY, comparisonDates } from "../src/lib/reports-schema";

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic");
}
const origin = "http://127.0.0.1:3000", suffix = randomUUID().slice(0, 8), session = `reports-${suffix}`;
assert.equal(process.env.BETTER_AUTH_URL, origin);
const output = resolve(".impeccable/review/reports"); mkdirSync(output, { recursive: true });
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
const password = "Synthetic reports browser password 2026!", email = `report-browser-${suffix}@example.test`;
function browser(...args: string[]): string {
  const result = spawnSync(resolve(".local/browser-tools/agent-browser-win32-x64.exe"), ["--session", session, ...args], { encoding: "utf8", windowsHide: true, timeout: 45000 });
  if (result.status !== 0) throw new Error(`Browser ${args[0]} failed: ${result.stderr || result.stdout}`);
  if (["open", "reload"].includes(args[0])) {
    browser("wait", "--load", "load");
    browser("wait", "--fn", "!!document.querySelector('h1')&&!document.querySelector('[aria-label=\"Loading reports\"]')");
    browser("wait", "--fn", "(()=>{const ids=Array.from(document.querySelectorAll('[id]')).map(e=>e.id);return new Set(ids).size===ids.length})()");
  }
  if (args[0] === "screenshot" && args[1]) {
    const file = result.stdout.match(/Screenshot saved to (.+)/)?.[1]?.trim();
    if (file && file !== args[1]) copyFileSync(file, args[1]);
  }
  return result.stdout;
}
const evaluate = (code: string) => JSON.parse(browser("eval", code, "--json")).data.result;
const click = (role: string, name: string) => browser("find", "role", role, "click", "--name", name, "--exact");
const waitText = (text: string) => browser("wait", "--text", text);
function setDate(id: string, value: string) {
  // The CLI's text fill clears Chromium's segmented date inputs. Set their native
  // value, emit normal edit events, then exercise the real submit button.
  evaluate(`(()=>{const input=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  assert.equal(evaluate(`document.getElementById(${JSON.stringify(id)}).value`), value);
}
const evidence: unknown[] = [];
function capture(label: string) {
  evaluate("(async()=>{await document.fonts.ready;return true})()");
  assert.equal(evaluate("document.documentElement.scrollWidth<=innerWidth && document.querySelector('#main').scrollWidth<=document.querySelector('#main').clientWidth"), true, `${label} overflow`);
  const audit = JSON.parse(browser("a11y", "--tags", "wcag2a,wcag2aa", "--json")).data;
  writeFileSync(resolve(output, "last-audit.json"), JSON.stringify({ label, ...audit }, null, 2));
  browser("screenshot", resolve(output, `${label}.png`), "--full");
  const resolutions = [];
  for (const issue of audit.incomplete) {
    assert.equal(issue.id, "color-contrast", `${label} unresolved incomplete`);
    for (const node of issue.nodes) {
      const selector = node.target[0];
      assert.equal(typeof selector, "string");
      assert.equal(evaluate(`!!document.querySelector(${JSON.stringify(selector)})?.closest('[data-slot=table]')`), true, "Only clipped visit-table text may use the scroll resolution");
      browser("scrollintoview", selector);
      const visibleAudit = JSON.parse(browser("a11y", "--selector", selector, "--tags", "wcag2a,wcag2aa", "--json")).data;
      assert.deepEqual(visibleAudit.violations, [], `${label} visible table text`);
      assert.deepEqual(visibleAudit.incomplete, [], `${label} visible table text incomplete`);
      resolutions.push({ selector, visibleAudit });
    }
  }
  if (evaluate("innerWidth<=768 && !!document.querySelector('[data-slot=table]')")) {
    evaluate("document.querySelector('[data-slot=card]:has(table)').scrollIntoView({block:'start'});true");
    browser("screenshot", resolve(output, `${label}-controls.png`), "--full");
    browser("scrollintoview", "[data-slot=table]");
    browser("screenshot", resolve(output, `${label}-log.png`), "--full");
  }
  if (evaluate("innerWidth<=768 && document.querySelector('#main').scrollHeight>document.querySelector('#main').clientHeight")) {
    evaluate("document.querySelector('#main').scrollTop=document.querySelector('#main').scrollHeight;true");
    browser("screenshot", resolve(output, `${label}-bottom.png`), "--full");
  }
  evidence.push({ label, ...audit, resolutions });
  writeFileSync(resolve(output, "audits.json"), JSON.stringify(evidence, null, 2));
  assert.deepEqual(audit.violations, [], `${label} accessibility violations`);
  console.log(`PASS ${label}`);
}
async function ownerHeaders() {
  const response = await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email, password }) }));
  assert.equal(response.status, 200);
  return new Headers({ cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") });
}
try {
  await admin.rateLimit.deleteMany();
  const gymId = randomUUID(); let token = "";
  const sender = { async send(message: { url: string }) { token = new URL(message.url).hash.slice(1); } };
  await bootstrapSyntheticOwner({ gymId, gymName: "Synthetic Reports Gym", name: "Reports Owner", email }, sender, admin);
  await completeSetup(token, password);
  const owner = await ownerHeaders();
  browser("open", `${origin}/login`); browser("snapshot", "-i");
  browser("fill", "#identifier", email); browser("fill", "#password", password); click("button", "Sign in");
  browser("wait", "--url", `${origin}/`);
  waitText("Welcome, Reports Owner");
  browser("open", `${origin}/reports`); browser("snapshot", "-i"); waitText("Member Insights"); capture("empty-members");
  for (const tab of ["revenue", "attendance"]) { browser("open", `${origin}/reports?tab=${tab}`); waitText(tab === "revenue" ? "Revenue Mix" : "Daily Visit Log"); capture(`empty-${tab}`); }
  const plans = await changePlans(owner, { action: "initialize" });
  const actor = await admin.operator.findFirstOrThrow({ where: { gymId, role: "OWNER" } });
  const now = new Date(), start = manilaMonthRange(now).start, previous = comparisonDates(now).previousStart;
  const members = [];
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const member = await admin.member.create({ data: { gymId, fullName: i === 0 ? '=HYPERLINK("example"), Synthetic Member' : ["", "Alexandra Mendoza", "Miguel Santos"][i], nameKey: randomUUID(), createdBy: actor.id } });
    members.push(member);
    for (const [index, collectedAt] of [previous, start].entries()) {
      const startsAt = index === 1 ? dayStart(manilaDay(now)) : new Date(start.getTime() - plan.durationDays * DAY);
      const endsAt = new Date(startsAt.getTime() + plan.durationDays * DAY);
      await admin.$transaction(async tx => {
        const charge = await tx.charge.create({ data: { gymId, memberId: member.id, planId: plan.id, planName: plan.name, durationDays: plan.durationDays, priceCentavos: plan.priceCentavos, planVersion: plan.version, preparedBy: actor.id, intendedStart: startsAt, intendedEnd: endsAt } });
        const payment = await tx.payment.create({ data: { gymId, memberId: member.id, chargeId: charge.id, reference: `REPORT-BROWSER-${randomUUID()}`, amountCentavos: plan.priceCentavos, method: "CASH", collectedBy: actor.id, verifiedBy: actor.id, collectedAt } });
        const period = await tx.membershipPeriod.create({ data: { gymId, memberId: member.id, paymentId: payment.id, confirmedBy: actor.id, startsAt, endsAt } });
        await tx.effectiveEntitlement.create({ data: { gymId, memberId: member.id, periodId: period.id, startsAt, endsAt } });
        await tx.paymentReceipt.create({ data: { gymId, paymentId: payment.id, reference: `REPORT-BROWSER-RECEIPT-${randomUUID()}` } });
      });
    }
  }
  const today = manilaDay(now), yesterday = manilaDay(new Date(now.getTime() - DAY));
  for (let i = 0; i < 22; i++) {
    const arrivedAt = new Date(dayStart(yesterday).getTime() + i * 30 * 60_000);
    await admin.attendanceVisit.create({ data: { gymId, memberId: members[0].id, arrivedAt, departedAt: new Date(arrivedAt.getTime() + 15 * 60_000), day: new Date(yesterday), isOpen: false } });
  }
  await admin.attendanceVisit.create({ data: { gymId, memberId: members[1].id, arrivedAt: dayStart(today), day: new Date(today), isOpen: true } });
  const logUrl = `${origin}/reports?${new URLSearchParams({ tab: "attendance", from: yesterday, to: today })}`;
  for (const theme of ["Light", "Dark"]) {
    click("button", "Appearance"); click("button", theme); browser("reload");
    assert.equal(evaluate("document.documentElement.classList.contains('dark')"), theme === "Dark");
    for (const width of [390, 320, 768, 1440]) {
      browser("set", "viewport", String(width), "1000");
      for (const tab of ["members", "revenue", "attendance"]) {
        browser("open", tab === "attendance" ? logUrl : `${origin}/reports?tab=${tab}`);
        waitText(tab === "members" ? "Members by Plan" : tab === "revenue" ? "Revenue Mix" : "Daily Visit Log");
        capture(`${theme}-${width}-${tab}`);
      }
    }
  }
  browser("set", "viewport", "1440", "1000"); browser("open", `${origin}/reports`); browser("snapshot", "-i");
  click("tab", "Members"); browser("press", "ArrowRight");
  assert.equal(evaluate("document.activeElement.textContent"), "revenue"); browser("press", "Enter"); waitText("Revenue Overview");
  assert.equal(evaluate("document.querySelector('[role=tab][aria-selected=true]').textContent"), "revenue");
  browser("open", logUrl); browser("snapshot", "-i"); click("link", "Next"); waitText("Page 2 of 2");
  assert.equal(evaluate("document.querySelectorAll('tbody tr').length"), 3);
  // Observe the real Blob and anchor invocation, delegating both browser primitives unchanged.
  // This runner cancels native saves; do not substitute this evidence for a saved file.
  evaluate(`(()=>{const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;
    URL.createObjectURL=function(blob){blob.text().then(csv=>window.__reportCsv=csv);return create.call(this,blob)};
    HTMLAnchorElement.prototype.click=function(){window.__reportDownload={name:this.download,blob:this.href.startsWith('blob:')};return click.call(this)};return true})()`);
  click("button", "Export CSV"); browser("wait", "--fn", "!!window.__reportCsv&&!!window.__reportDownload");
  const exported = evaluate("window.__reportCsv");
  assert.deepEqual(evaluate("window.__reportDownload"), { name: `attendance-${yesterday}-to-${today}.csv`, blob: true });
  writeFileSync(resolve(output, "attendance-payload.csv"), exported);
  assert.equal(exported.trim().split("\r\n").length, 24); assert.equal(exported.split(members[0].id).length - 1, 22); assert.ok(exported.includes('"\'=HYPERLINK'));
  browser("network", "route", "**/api/reports/attendance*", "--abort"); click("button", "Export CSV");
  waitText("CSV export could not be completed. Try Export CSV again."); capture("export-error");
  browser("network", "unroute"); evaluate("window.__reportCsv=null;window.__reportDownload=null;true");
  click("button", "Export CSV"); browser("wait", "--fn", "!!window.__reportCsv&&!!window.__reportDownload");
  assert.equal(evaluate("window.__reportCsv"), exported);
  setDate("report-from", today); setDate("report-to", today); click("button", "Apply dates");
  browser("wait", "--fn", `new URLSearchParams(location.search).get('from')===${JSON.stringify(today)}&&document.querySelectorAll('tbody tr').length===1`);
  assert.equal(evaluate("document.querySelectorAll('tbody tr').length"), 1);
  setDate("report-week", yesterday); click("button", "View week");
  browser("wait", "--fn", `new URLSearchParams(location.search).get('week')===${JSON.stringify(yesterday)}`); waitText("Daily Visit Log");
  browser("open", `${origin}/reports?tab=attendance&from=2026-12-01&to=2026-11-01`); waitText("Choose a date range"); capture("invalid-dates");
  browser("cookies", "clear"); browser("open", `${origin}/reports`); browser("wait", "--url", `${origin}/login`);
  await inviteStaff(owner, { name: "Reports Staff", email: `report-staff-${suffix}@example.test`, username: `rep_${suffix}` }, sender); await completeSetup(token, password);
  click("radio", "Staff"); browser("fill", "#identifier", `rep_${suffix}`); browser("fill", "#password", password); click("button", "Sign in"); browser("wait", "--url", `${origin}/settings/team`);
  browser("open", `${origin}/reports`); waitText("Reports are available to the gym owner.");
  assert.equal(evaluate("(async()=>{const r=await fetch('/api/reports/attendance');return r.status})()"), 403);
  assert.equal(evaluate("!!document.querySelector('[role=tablist]')"), false);
  console.log("PASS keyboard tabs, pagination, actual CSV payload/Blob/filename and failure/retry, date/week forms, anonymous and staff gates; native Save remains NOT VERIFIED (runner cancels downloads)");
} catch (error) {
  console.log("Failure page:", evaluate("(()=>{const ids=Array.from(document.querySelectorAll('[id]')).map(e=>e.id);return {path:location.pathname,headings:Array.from(document.querySelectorAll('h1,h2')).map(e=>e.textContent),duplicateIds:ids.filter((id,i)=>ids.indexOf(id)!==i)}})()"));
  browser("screenshot", resolve(output, "failure.png"), "--full");
  throw error;
} finally { browser("close"); await db.$disconnect(); await admin.$disconnect(); }
