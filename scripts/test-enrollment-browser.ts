import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { assertSynthetic } from "../src/lib/email";
import { bootstrapSyntheticOwner, completeSetup } from "../src/lib/identity";
import { db } from "../src/lib/db";

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic");
}
const origin = process.env.BETTER_AUTH_URL!;
assert.equal(origin, "http://127.0.0.1:3000");
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }) });
const suffix = randomUUID().slice(0, 8), gymId = randomUUID(), memberId = randomUUID();
const email = `enroll-${suffix}@example.test`, password = "Synthetic enrollment password 2026!";
const binary = resolve(".local/browser-tools/agent-browser-win32-x64.exe"), session = `enroll-${suffix}`;
const output = resolve(".impeccable/review/enrollment"); mkdirSync(output, { recursive: true });
function browser(...args: string[]): string {
  const result = spawnSync(binary, ["--session", session, ...args], { encoding: "utf8", windowsHide: true, timeout: 45_000 });
  if (result.status !== 0) throw new Error(`Enrollment browser '${args[0]}' failed; output withheld to protect credentials.`);
  return result.stdout;
}
function evaluate(code: string) { return JSON.parse(browser("eval", code, "--json")).data.result; }
function click(name: string) { browser("find", "role", "button", "click", "--name", name, "--exact"); }
function audit(label: string) {
  const overflow = evaluate("[...document.querySelectorAll('#membership-payment, #membership-payment [data-slot=card]')].filter(e=>e.scrollWidth>e.clientWidth).map(e=>({tag:e.tagName,width:e.clientWidth,scroll:e.scrollWidth}))");
  assert.deepEqual(overflow, [], `${label} no overflow`);
  assert.equal(evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `${label} document fits`);
  const result = JSON.parse(browser("a11y", "--selector", "#membership-payment", "--tags", "wcag2a,wcag2aa", "--json")).data;
  assert.equal(result.counts.violations, 0, `${label}: ${JSON.stringify(result.violations)}`);
  assert.equal(result.incomplete?.length ?? 0, 0, `${label}: ${JSON.stringify(result.incomplete)}`);
}
function capture(label: string) {
  evaluate("(()=>{window.scrollTo(0,0); const main=document.getElementById('main'),flow=document.getElementById('membership-payment'); main.scrollTop+=flow.getBoundingClientRect().top-main.getBoundingClientRect().top-24; return true;})()");
  browser("screenshot", resolve(output, `${label}.png`)); audit(label);
  console.log(`PASS: ${label} bounds and axe.`);
}
try {
  let token = "";
  await bootstrapSyntheticOwner({ gymId, gymName: "Synthetic Enrollment Gym", name: "Enrollment Operator", email }, { async send(message) { token = new URL(message.url).hash.slice(1); } }, admin);
  await completeSetup(token, password);
  const owner = await admin.operator.findFirstOrThrow({ where: { gymId, role: "OWNER" } });
  await admin.plan.createMany({ data: [ ["Monthly", 30, 80000], ["3 Months", 90, 210000], ["6 Months", 180, 400000] ].map(([name, days, price]) => ({ gymId, name: String(name), durationDays: Number(days), priceCentavos: Number(price), createdBy: owner.id })) });
  await admin.member.create({ data: { id: memberId, gymId, fullName: "Alex Enrollment", nameKey: "alex enrollment", createdBy: owner.id } });
  browser("open", `${origin}/login`); browser("fill", "#identifier", email); browser("fill", "#password", password); click("Sign in");
  browser("wait", "--text", "Welcome, Enrollment Operator");
  browser("open", `${origin}/members/${memberId}`); browser("wait", "#membership-payment");
  if (process.argv.includes("--baseline")) {
    for (const theme of ["light", "dark"]) {
      click("Appearance"); click(theme === "light" ? "Light" : "Dark");
      browser("set", "viewport", "1440", "1000"); browser("scrollintoview", "#membership-payment");
      browser("screenshot", resolve(output, `before-${theme}.png`));
    }
    browser("open", "file:///C:/Users/JAD/Documents/Codex/2026-11-07/i-have-a-gym-saas-management/outputs/membership-enrollment-shadcn-preview.html");
    browser("screenshot", resolve(output, "reference.png"));
    console.log("PASS: existing flow and user reference captured.");
  } else {
    for (const theme of ["light", "dark"]) {
      click("Appearance"); click(theme === "light" ? "Light" : "Dark"); browser("reload"); browser("wait", "#membership-payment");
      assert.equal(evaluate("document.documentElement.classList.contains('dark')"), theme === "dark", "Theme persists");
      for (const [device, width] of [["desktop", 1440], ["tablet", 768], ["phone", 375], ["narrow", 320]] as const) {
        browser("set", "viewport", String(width), "1000"); capture(`${theme}-${device}-plan`);
      }
    }
    browser("set", "viewport", "1440", "1000");
    const plans = await admin.plan.findMany({ where: { gymId }, orderBy: { durationDays: "asc" } });
    browser("check", `input[name=planId][value='${plans[1].id}']`);
    assert.equal(evaluate("document.querySelector('[aria-label=\"Charge and access summary\"]').innerText.includes('₱2,100.00')"), true);
    browser("focus", `input[name=planId][value='${plans[1].id}']`); browser("press", "ArrowLeft");
    assert.equal(evaluate("document.querySelector('input[name=planId]:checked').value"), plans[0].id, "Native radio keyboard selection");
    click("Continue to payment"); browser("wait", "#cash-received");
    assert.equal(await admin.payment.count({ where: { memberId } }), 0);
    browser("fill", "#cash-received", "799.99"); click("Review cash payment"); browser("wait", "--text", "Enter the exact full amount");
    assert.equal(evaluate("document.activeElement.id"), "cash-error", "Error receives focus");
    assert.equal(await admin.payment.count({ where: { memberId } }), 0);
    browser("fill", "#cash-received", "800.00"); click("Review cash payment"); browser("wait", "--text", "Check before recording payment");
    assert.equal(evaluate("document.activeElement.id"), "charge-title", "Step heading receives focus");
    click("Back to payment");
    browser("check", "input[name=paymentMethod][value=Online]"); browser("wait", "#online-provider");
    for (const provider of ["GCash", "GoTyme", "MariBank"]) browser("select", "#online-provider", provider);
    browser("fill", "#online-reference", `BROWSER-${suffix}`); click("Review online payment"); browser("wait", "--text", "Check the full funds");
    assert.equal(await admin.payment.count({ where: { memberId } }), 0, "Unchecked funds do not pay");
    browser("check", "#membership-payment input[type=checkbox]");
    for (const theme of ["light", "dark"]) {
      click("Appearance"); click(theme === "light" ? "Light" : "Dark");
      for (const [device, width] of [["desktop", 1440], ["tablet", 768], ["phone", 375], ["narrow", 320]] as const) {
        browser("set", "viewport", String(width), "1000"); capture(`${theme}-${device}-online`);
      }
    }
    click("Review online payment"); browser("wait", "--text", "Check before recording payment");
    assert.equal(await admin.payment.count({ where: { memberId } }), 0, "Review creates no payment");
    for (const theme of ["light", "dark"]) {
      click("Appearance"); click(theme === "light" ? "Light" : "Dark");
      for (const [device, width] of [["desktop", 1440], ["tablet", 768], ["phone", 375], ["narrow", 320]] as const) {
        browser("set", "viewport", String(width), "1000"); capture(`${theme}-${device}-review`);
      }
    }
    evaluate("window.enrollmentFetch=window.fetch; window.fetch=async (...args)=>{const response=await window.enrollmentFetch(...args); if(args[0]==='/api/payments/online' && response.ok) throw new Error('Synthetic lost response'); return response;}; true");
    click("Confirm received online payment"); browser("wait", "--text", "Synthetic lost response");
    assert.equal(await admin.payment.count({ where: { memberId } }), 1, "Payment committed before response loss");
    browser("reload"); browser("wait", "--text", "Confirmation status unknown");
    assert.equal(evaluate("!!document.querySelector('input[name=paymentMethod]')"), false, "No method switch while unresolved");
    capture("dark-narrow-recovery"); click("Retry same confirmation"); browser("wait", "--text", "Full online payment confirmed");
    assert.equal(await admin.payment.count({ where: { memberId } }), 1);
    assert.equal(evaluate("document.querySelector('[aria-label=\"Charge and access summary\"]').innerText.includes('Paid period start') && !document.querySelector('[aria-label=\"Charge and access summary\"]').innerText.includes('Proposed start')"), true, "Confirmed summary uses committed paid-period labels");
    capture("dark-narrow-success");
    for (const theme of ["light", "dark"]) {
      click("Appearance"); click(theme === "light" ? "Light" : "Dark");
      for (const [device, width] of [["desktop", 1440], ["phone", 375], ["narrow", 320]] as const) {
        browser("set", "viewport", String(width), "1000"); capture(`${theme}-${device}-success`);
        browser("scrollintoview", "[aria-label='Charge and access summary']");
        browser("screenshot", resolve(output, `${theme}-${device}-paid-summary.png`));
      }
    }
    browser("find", "role", "link", "click", "--name", "View receipt", "--exact"); browser("wait", "#receipt-title");
    assert.equal(evaluate("document.querySelector('main').innerText.includes('MariBank')"), true, "Receipt names provider");
    browser("open", `${origin}/members/${memberId}`); browser("wait", "#membership-payment");
    click("Continue to payment"); browser("wait", "#cash-received"); click("Review cash payment"); click("Confirm full cash"); browser("wait", "--text", "Full cash payment confirmed");
    assert.equal(await admin.payment.count({ where: { memberId } }), 2, "One advance cash term");
    browser("reload"); browser("wait", "--text", "An advance renewal is already fully paid");
    assert.equal(evaluate("[...document.querySelectorAll('#membership-payment input[name=planId]')].every(e=>e.disabled)"), true, "Queued sale blocks plan selection");
    console.log("PASS: both themes, four sizes, keyboard/focus, exact amount/attestation, Online lost-response recovery, receipt and advance cash/queued sale.");
  }
} finally {
  try { browser("close"); } catch { /* Preserve primary failure. */ }
  await db.$disconnect(); await admin.$disconnect();
}
