import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { bootstrapSyntheticOwner } from "../src/lib/identity";
import { assertSynthetic } from "../src/lib/email";
import { db } from "../src/lib/db";

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/gym_crm_synthetic");
}
const binary = resolve(".local/browser-tools/agent-browser-win32-x64.exe");
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }) });
const session = `gym-ui-${randomUUID().slice(0, 8)}`;
const origin = process.env.BETTER_AUTH_URL!;
assert.equal(origin, "http://127.0.0.1:3000");
const suffix = randomUUID().slice(0, 8);
const email = `ui-owner-${suffix}@example.test`;
const password = "Synthetic UI password 2026!";
const before = process.argv.includes("--before");
const output = resolve(".local/ui-redesign");
mkdirSync(output, { recursive: true });
function browser(...args: string[]) {
  const result = spawnSync(binary, ["--session", session, ...args], { encoding: "utf8", windowsHide: true, timeout: 45_000 });
  if (result.status !== 0) throw new Error(`Browser step ${args[0]} failed; output withheld to protect synthetic links.`);
  return result.stdout;
}
function evaluate(code: string) { return JSON.parse(browser("eval", code, "--json")).data.result; }
function click(name: string) { browser("find", "role", "button", "click", "--name", name, "--exact"); }
function text(value: string) { browser("wait", "--text", value); }
function audit(label: string) {
  const result = JSON.parse(browser("a11y", "--tags", "wcag2a,wcag2aa", "--json")).data;
  if (result.incomplete?.some((item: { id: string }) => item.id === "aria-hidden-focus") && evaluate("!!document.querySelector('[role=dialog]')")) {
    // axe cannot determine Radix's runtime focus containment; verify both wrap directions.
    browser("focus", '[role="dialog"] button:has-text("Close")'); browser("press", "Tab");
    assert.equal(evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)"), true);
    browser("press", "Shift+Tab");
    assert.equal(evaluate("document.activeElement.textContent"), "Close");
    assert.equal(evaluate("(() => { document.querySelector('#reauth-password').focus(); return document.querySelector('[role=dialog]').contains(document.activeElement); })()"), true);
    result.counts.incomplete -= result.incomplete.filter((item: { id: string }) => item.id === "aria-hidden-focus").length;
    console.log(`${label}: aria-hidden-focus manual review PASS (Tab/Shift+Tab wrap and blocked background focus).`);
  }
  if (result.counts.violations || result.counts.incomplete) console.log(JSON.stringify(result));
  assert.equal(result.counts.violations, 0, label); assert.equal(result.counts.incomplete, 0, label);
}
let failure: unknown;
try {
  let setupUrl = "";
  const gymId = randomUUID();
  await bootstrapSyntheticOwner({ gymId, gymName: "Synthetic Studio Gym", email, name: "Studio Owner" }, { async send(message) { setupUrl = message.url; } }, admin);
  browser("open", setupUrl);
  browser("fill", "#password", password); browser("fill", "#confirmation", password); click("Save private password");
  text("Your password is ready"); browser("open", `${origin}/login`);
  browser("fill", "#identifier", email); browser("fill", "#password", password); click("Sign in");
  text("Welcome, Studio Owner"); browser("open", `${origin}/team`); text("Operators");
  if (before) {
    for (const [name, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1024], ["mobile", 375, 812]] as const) {
      browser("set", "viewport", String(width), String(height));
      browser("screenshot", resolve(output, `before-${name}.png`), "--full");
    }
    console.log("Before screenshots captured at 1440, 768, 375px.");
  } else {
    console.log("Owner workspace loaded.");
    click("Send invitation"); text("Check the account fields below.");
    assert.equal(evaluate("document.activeElement.id"), "operator-feedback");
    assert.equal(evaluate("document.getElementById('staff-name').getAttribute('aria-invalid')"), "true");
    browser("fill", "#reauth-password", "incorrect password"); click("Verify password"); text("Unable to verify your password.");
    assert.equal(evaluate("document.activeElement.id"), "reauth-password-feedback");
    assert.equal(evaluate("document.getElementById('reauth-password').value"), "");
    browser("fill", "#reauth-password", password); click("Verify password"); text("Password verified for five minutes.");
    async function invite(name: string, tag: string) {
      browser("fill", "#staff-name", name); browser("fill", "#staff-username", `${tag}_${suffix}`);
      browser("fill", "#staff-email", `${tag}-${suffix}@example.test`); click("Send invitation"); text("Link captured for the recipient.");
      return admin.operator.findFirstOrThrow({ where: { gymId, user: { username: `${tag}_${suffix}` } } });
    }
    const staff = await invite("Front Desk Operator", "desk");
    const invitation = await admin.invitation.findFirstOrThrow({ where: { operatorId: staff.id, consumedAt: null }, orderBy: { createdAt: "desc" } });
    const staffUrl = JSON.parse(readFileSync(resolve(".local/mailbox", `${invitation.id}.json`), "utf8")).url;
    click("Sign out"); text("You are signed out."); browser("open", staffUrl);
    browser("fill", "#password", password); browser("fill", "#confirmation", password); click("Save private password"); text("Your password is ready");
    browser("open", `${origin}/login`); browser("fill", "#identifier", email); browser("fill", "#password", password); click("Sign in"); text("Welcome, Studio Owner"); browser("open", `${origin}/team`);
    text("Front Desk Operator");
    // Fresh owner verification remains enforced by the real API.
    click("Save permissions"); text("Verify your password again before this action.");
    browser("fill", "#reauth-password", password); click("Verify password"); text("Password verified for five minutes.");
    browser("check", `#members-${staff.id}`); click("Save permissions"); text("Staff permissions saved.");
    assert.equal((await admin.operator.findUniqueOrThrow({ where: { id: staff.id } })).canManageMembers, true);
    click("Disable staff"); text("Current sessions and unused setup/reset links will stop working immediately.");
    assert.equal(evaluate("document.activeElement.textContent"), "Confirm disable");
    browser("press", "Escape"); assert.equal(evaluate("document.activeElement.textContent"), "Disable staff");
    await invite("Pending Operator With A Deliberately Long Name For Responsive Layout Review", "pending");
    const disabled = await invite("Former Operator", "former");
    // Target the matching list item without depending on row order.
    browser("click", `li:has(button[aria-controls="disable-confirmation-${disabled.id}"]) button[aria-controls]`);
    click("Confirm disable"); text("Staff disabled. Current sessions and links revoked.");
    assert.equal(evaluate("document.activeElement.id"), "operators-title");
    // Reset still issues a captured link and does not claim account activation.
    click("Send reset link"); text("Link captured for the recipient.");
    for (const theme of ["light", "dark"]) {
      browser("select", 'select[aria-label="Appearance"]', theme);
      browser("wait", "--fn", `document.documentElement.classList.contains('dark') === ${theme === "dark"}`);
      browser("open", `${origin}/team`); text("Front Desk Operator");
      assert.equal(evaluate("document.documentElement.classList.contains('dark')"), theme === "dark");
      for (const [name, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1024], ["mobile", 375, 812]] as const) {
        browser("set", "viewport", String(width), String(height));
        assert.equal(evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `${theme} ${name} overflow`);
        audit(`${theme} ${name}`); browser("screenshot", resolve(output, `${theme}-${name}.png`), "--full");
        console.log(`${theme} ${name}: overflow and axe PASS; screenshot captured.`);
      }
      browser("focus", '[data-sidebar="trigger"]'); browser("press", "Enter");
      browser("wait", '[role="dialog"]');
      assert.equal(evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)"), true);
      audit(`${theme} mobile navigation`); browser("screenshot", resolve(output, `${theme}-mobile-navigation.png`), "--full");
      browser("press", "Escape");
      browser("wait", "--fn", "!document.querySelector('[role=dialog]')");
      assert.equal(evaluate("document.activeElement?.dataset.sidebar"), "trigger");
      browser("press", "Enter"); browser("wait", '[role="dialog"]');
      browser("click", '[role="dialog"] a[href="/members"]'); text("Member directory");
      browser("wait", "--fn", "!document.querySelector('[role=dialog]')");
      browser("open", `${origin}/team`); text("Front Desk Operator");
      browser("set", "viewport", "1440", "1000");
      click("Toggle Sidebar");
      assert.equal(evaluate("document.querySelector('[data-sidebar=trigger]').getAttribute('aria-expanded')"), "false");
      browser("focus", '[data-sidebar="trigger"]'); browser("press", "Enter");
      assert.equal(evaluate("document.querySelector('[data-sidebar=trigger]').getAttribute('aria-expanded')"), "true");
      audit(`${theme} desktop navigation restored`);
    }
    browser("set", "media", "dark"); browser("select", 'select[aria-label="Appearance"]', "system");
    browser("wait", "--fn", "document.documentElement.classList.contains('dark')");
    browser("set", "media", "light"); browser("wait", "--fn", "!document.documentElement.classList.contains('dark')");
    browser("open", `${origin}/team`); assert.equal(evaluate("document.querySelector('select[aria-label=Appearance]').value"), "system");
    for (const theme of ["light", "dark"]) {
      browser("select", 'select[aria-label="Appearance"]', theme);
      // UI-only response stubs exercise exceptional list states, then are removed.
      browser("network", "route", "**/api/identity/operators", "--body", "[]");
      browser("open", `${origin}/team`); text("No operators to display"); audit(`${theme} empty list`);
      browser("screenshot", resolve(output, `${theme}-empty.png`), "--full");
      browser("network", "unroute"); browser("network", "route", "**/api/identity/operators", "--abort");
      browser("open", `${origin}/team`); text("Unable to load operators."); audit(`${theme} list failure`);
      browser("screenshot", resolve(output, `${theme}-error.png`), "--full");
      browser("network", "unroute");
      evaluate("(() => { const send=window.fetch; window.fetch=function(input,init){if(input==='/api/identity/operators'){window.fetch=send;return new Promise(resolve=>{window.releaseList=()=>resolve(send.call(this,input,init))})}return send.call(this,input,init)}; return true })()");
      click("Retry loading operators"); text("Loading operators…"); audit(`${theme} loading list`);
      browser("screenshot", resolve(output, `${theme}-loading.png`), "--full");
      evaluate("window.releaseList(); true"); text("Front Desk Operator");
      click("Send invitation"); text("Check the account fields below."); audit(`${theme} field errors`);
      browser("screenshot", resolve(output, `${theme}-validation.png`), "--full");
      browser("fill", "#staff-name", "Pending Operator With A Deliberately Long Name For Responsive Layout Review");
      browser("fill", "#staff-username", `pending_${suffix}`); browser("fill", "#staff-email", `pending-${suffix}@example.test`);
      evaluate("(() => { const send=window.fetch; window.fetch=function(input,init){if(input==='/api/identity/invite'){window.fetch=send;return new Promise(resolve=>{window.releaseInvite=()=>resolve(send.call(this,input,init))})}return send.call(this,input,init)}; return true })()");
      click("Send invitation"); text("Sending invitation…");
      assert.equal(evaluate("document.getElementById('staff-email').disabled && document.getElementById('reauth-password').disabled && document.querySelector('form[aria-busy=true] button[type=submit]').disabled"), true);
      audit(`${theme} submitting`); browser("screenshot", resolve(output, `${theme}-busy.png`), "--full");
      evaluate("window.releaseInvite(); true"); text("Link captured for the recipient."); audit(`${theme} success`);
      browser("screenshot", resolve(output, `${theme}-success.png`), "--full");
      // Clear invitation inputs before the next validation pass.
      for (const id of ["staff-name", "staff-username", "staff-email"]) browser("fill", `#${id}`, "");
    }
    browser("set", "viewport", "320", "812");
    assert.equal(evaluate("document.documentElement.scrollWidth <= innerWidth"), true, "320px reflow");
    audit("320px reflow");
    browser("set", "viewport", "1440", "1000");
    browser("find", "role", "link", "click", "--name", "Members", "--exact"); text("Member directory");
    browser("open", `${origin}/team`); text("Team & access");
    console.log("Themes/system/persistence, real invitation/permissions/reset/disable, focus/cancel, list states and navigation PASS.");
  }
} catch (error) { try { browser("screenshot", resolve(output, "failure.png"), "--full"); } catch {} failure = error; }
finally {
  try { browser("close"); } catch (error) { failure ??= error; }
  await admin.$disconnect(); await db.$disconnect();
}
if (failure) throw failure;
