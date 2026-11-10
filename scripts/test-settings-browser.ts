import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { assertSynthetic } from "../src/lib/email";
import { bootstrapSyntheticOwner, completeSetup, inviteStaff } from "../src/lib/identity";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic");
}
const origin = "http://127.0.0.1:3000", suffix = randomUUID().slice(0, 8), session = `settings-${suffix}`;
assert.equal(process.env.BETTER_AUTH_URL, origin);
const output = resolve(".impeccable/review/settings"); mkdirSync(output, { recursive: true });
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
const password = "Synthetic settings password 2026!", email = `settings-${suffix}@example.test`;
function browser(...args: string[]): string {
  const result = spawnSync(resolve(".local/browser-tools/agent-browser-win32-x64.exe"), ["--session", session, ...args], { encoding: "utf8", windowsHide: true, timeout: 45000 });
  if (result.status !== 0) throw new Error(`Browser ${args[0]} failed: ${result.stderr}`);
  if (["open", "reload"].includes(args[0])) {
    browser("wait", "--load", "load");
    browser("wait", "--fn", "(()=>{if(!location.pathname.startsWith('/settings'))return true;const id=location.pathname.endsWith('/plans')?'settings-plans-title':location.pathname.endsWith('/team')?'operators-title':'gym-profile-title';const heading=document.getElementById(id);const ids=Array.from(document.querySelectorAll('[id]')).map(e=>e.id);return heading?.getBoundingClientRect().height>0&&!document.querySelector('[aria-label=\"Loading settings\"]')&&new Set(ids).size===ids.length})()");
    evaluate("document.querySelectorAll('nextjs-portal').forEach(e=>e.style.display='none');true");
  }
  if (args[0] === "screenshot" && args[1]) { const file = result.stdout.match(/Screenshot saved to (.+)/)?.[1]?.trim(); if (file && file !== args[1]) copyFileSync(file, args[1]); }
  return result.stdout;
}
const evaluate = (code: string) => JSON.parse(browser("eval", code, "--json")).data.result;
const click = (name: string) => browser("find", "role", "button", "click", "--name", name, "--exact");
const text = (value: string) => browser("wait", "--text", value);
function capture(label: string) {
  assert.equal(evaluate("document.documentElement.scrollWidth<=innerWidth && document.querySelector('#main').scrollWidth<=document.querySelector('#main').clientWidth"), true, `${label} overflow`);
  const audit = JSON.parse(browser("a11y", "--tags", "wcag2a,wcag2aa", "--json")).data;
  assert.deepEqual(audit.violations, [], `${label} axe violations`);
  const unresolved = audit.incomplete.filter((issue: { id: string; nodes: { target: string[] }[] }) => {
    if (issue.id !== "aria-valid-attr-value") return true;
    // Axe requests manual confirmation of aria-controls on a portalled menu.
    // Resolve only when the referenced, visible menu exists and the trigger is expanded.
    return !issue.nodes.every(node => evaluate(`(()=>{const trigger=document.querySelector(${JSON.stringify(node.target[0])});const menu=document.getElementById(trigger?.getAttribute('aria-controls'));return trigger?.getAttribute('aria-haspopup')==='menu'&&trigger?.getAttribute('aria-expanded')==='true'&&menu?.getAttribute('role')==='menu'&&menu.getBoundingClientRect().height>0})()`));
  });
  assert.deepEqual(unresolved, [], `${label} unresolved axe incompletes`);
  browser("screenshot", resolve(output, `${label}.png`), "--full");
  if (evaluate("innerWidth<=768 && !document.querySelector('[role=menu]')")) {
    evaluate("document.getElementById('main').scrollTo(0,document.getElementById('main').scrollHeight);true");
    browser("screenshot", resolve(output, `${label}-bottom.png`));
    evaluate("document.getElementById('main').scrollTo(0,0);true");
  }
  console.log(`PASS ${label}`);
}
function login(identifier: string, staff = false) {
  browser("open", `${origin}/login`);
  if (staff) browser("find", "role", "radio", "click", "--name", "Staff", "--exact");
  browser("fill", "#identifier", identifier); browser("fill", "#password", password); click("Sign in");
  browser("wait", "--url", staff ? `${origin}/settings/team` : `${origin}/`);
}
try {
  await admin.rateLimit.deleteMany();
  const gymId = randomUUID(); let token = "";
  const sender = { async send(message: { url: string }) { token = new URL(message.url).hash.slice(1); } };
  await bootstrapSyntheticOwner({ gymId, gymName: "Synthetic Settings Gym", name: "Settings Owner", email }, sender, admin);
  await completeSetup(token, password);
  login(email); text("Welcome, Settings Owner");
  browser("focus", 'button[aria-label="Account: Settings Owner, Owner"]'); browser("press", "Enter"); text("Log out");
  assert.deepEqual(evaluate("Array.from(document.querySelectorAll('[role=menuitem]')).map(e=>e.textContent.trim())"), ["Settings", "Log out"]);
  assert.equal(evaluate("document.querySelectorAll('[role=menuitem] svg').length"), 2);
  browser("press", "Escape");
  browser("wait", "--fn", "document.activeElement.getAttribute('aria-label')==='Account: Settings Owner, Owner'");
  assert.equal(evaluate("document.activeElement.getAttribute('aria-label')"), "Account: Settings Owner, Owner");
  click("Account: Settings Owner, Owner"); browser("find", "role", "menuitem", "click", "--name", "Settings", "--exact"); text("Gym profile");
  assert.equal(evaluate("location.pathname"), "/settings");
  for (const theme of ["Light", "Dark"]) {
    click("Appearance"); click(theme); browser("reload"); text("Gym profile");
    assert.equal(evaluate("document.documentElement.classList.contains('dark')"), theme === "Dark");
    for (const width of [1440, 1024, 768, 390, 320]) {
      browser("set", "viewport", String(width), "1000");
      for (const [path, heading] of [["", "Gym profile"], ["/plans", "Plans and Pricing"], ["/team", "Team and Access"]]) {
        browser("open", `${origin}/settings${path}`); text(heading);
        if (path === "/team") browser("wait", "--fn", "document.querySelectorAll('[aria-labelledby=operators-title] li').length>0");
        assert.equal(evaluate("document.querySelectorAll('input[type=password]').length"), 0);
        capture(`${theme}-${width}-${path.slice(1) || "profile"}`);
        if (!path && [1440, 320].includes(width)) { click("Account: Settings Owner, Owner"); capture(`${theme}-${width}-menu`); browser("press", "Escape"); }
      }
    }
    browser("open", `${origin}/settings`); text("Gym profile"); click("Edit profile"); capture(`${theme}-320-edit`); click("Cancel");
  }
  browser("set", "viewport", "1440", "1000"); browser("open", `${origin}/settings`); text("Gym profile"); click("Edit profile");
  browser("fill", "#gym-name", " "); click("Save changes"); text("Enter the gym name."); capture("invalid-profile");
  assert.equal(evaluate("document.activeElement.id"), "gym-profile-feedback");
  browser("fill", "#gym-name", "Updated Synthetic Gym"); browser("fill", "#gym-contactEmail", "gym@example.test");
  browser("fill", "#gym-phone", "+63 912 345 6789"); browser("fill", "#gym-address", "123 Synthetic Street");
  browser("fill", "#gym-profileTimezone", "America/New_York"); browser("fill", "#gym-profileCountry", "United States"); browser("select", "#gym-profileCurrency", "USD");
  assert.equal(evaluate("document.querySelectorAll('input[type=password]').length"), 0);
  click("Save changes"); text("Gym profile saved.");
  browser("wait", "--fn", "document.activeElement.textContent.trim()==='Edit profile'");
  assert.equal(evaluate("document.activeElement.textContent.trim()"), "Edit profile");
  browser("reload"); text("Updated Synthetic Gym"); text("America/New_York"); text("USD"); capture("saved-profile");
  assert.equal((await admin.gym.findUniqueOrThrow({ where: { id: gymId } })).contactEmail, "gym@example.test");
  click("Edit profile"); browser("fill", "#gym-name", "Discarded Name"); click("Cancel");
  assert.equal(evaluate("document.querySelector('section[aria-labelledby=gym-profile-title]').textContent.includes('Discarded Name')"), false);
  // A held, then failed request exercises disabled controls and safe connection recovery.
  click("Edit profile");
  evaluate("window.settingsFetch=window.fetch;window.fetch=(...args)=>String(args[0]).includes('/api/settings/profile')?new Promise((resolve,reject)=>{window.rejectSettingsSave=reject}):window.settingsFetch(...args);true");
  click("Save changes"); text("Saving…");
  assert.equal(evaluate("document.querySelector('form[aria-label=\"Edit gym profile\"] fieldset').disabled"), true);
  capture("saving-profile"); evaluate("window.rejectSettingsSave(new Error('Synthetic connection failure'));window.fetch=window.settingsFetch;true");
  text("Unable to confirm the save."); capture("connection-error-profile"); click("Cancel");
  // Persisted concurrent change is rejected, preserving the user's typed details.
  click("Edit profile"); await admin.gym.update({ where: { id: gymId }, data: { profileVersion: { increment: 1 } } });
  click("Save changes"); text("Gym profile changed since you opened it."); capture("stale-profile"); click("Cancel");
  for (const [old, target] of [["/plans", "/settings/plans"], ["/team", "/settings/team"]]) {
    browser("open", `${origin}${old}`); browser("wait", "--url", `${origin}${target}`);
  }
  browser("open", `${origin}/settings/plans`); text("Set up the approved catalogue");
  assert.equal(evaluate("document.querySelectorAll('input[type=password]').length"), 0);
  click("Apply approved catalogue"); text("Current catalogue");
  const plan = await admin.plan.findFirstOrThrow({ where: { gymId, durationDays: 30 } });
  browser("fill", `#price-${plan.id}`, "0"); click("Save Monthly price"); text("Enter a positive PHP price");
  browser("fill", `#price-${plan.id}`, "850.00"); click("Save Monthly price"); text("Catalogue saved.");
  assert.equal((await admin.plan.findUniqueOrThrow({ where: { id: plan.id } })).priceCentavos, 85000);
  for (const theme of ["Light", "Dark"]) {
    click("Appearance"); click(theme);
    for (const width of [1440, 1024, 768, 320]) {
      browser("set", "viewport", String(width), "1000");
      assert.equal(evaluate("Array.from(document.querySelectorAll('input[inputmode=decimal]')).every(e=>e.clientWidth>=120)"), true, `${theme}-${width} readable price fields`);
      capture(`${theme}-${width}-populated-plans`);
    }
  }
  browser("set", "viewport", "1440", "1000");
  click("Appearance"); click("System"); browser("reload"); text("Current catalogue");
  assert.equal(evaluate("localStorage.getItem('gym-appearance')==='system' && document.documentElement.classList.contains('dark')===matchMedia('(prefers-color-scheme: dark)').matches"), true);
  // Invite through the unchanged server path; UI routes and permissions are checked below.
  const response = await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ email, password }) }));
  const owner = new Headers({ cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") });
  await inviteStaff(owner, { name: "Settings Staff", email: `settings-staff-${suffix}@example.test`, username: `settings_${suffix}` }, sender); await completeSetup(token, password);
  const staff = await admin.operator.findFirstOrThrow({ where: { gymId, user: { username: `settings_${suffix}` } } });
  browser("open", `${origin}/settings/team`); text("Settings Staff");
  assert.equal(evaluate("document.querySelectorAll('input[type=password]').length"), 0);
  browser("check", `#members-${staff.id}`); click("Save permissions"); text("Staff permissions saved.");
  assert.equal((await admin.operator.findUniqueOrThrow({ where: { id: staff.id } })).canManageMembers, true);
  browser("uncheck", `#members-${staff.id}`); click("Save permissions"); text("Staff permissions saved.");
  browser("click", `#reset-staff-${staff.id}`); text("Link captured for the recipient.");
  browser("fill", "#staff-name", "Settings Pending"); browser("fill", "#staff-username", `pending_${suffix}`); browser("fill", "#staff-email", `pending-${suffix}@example.test`); click("Send invitation"); text("Settings Pending");
  const pending = await admin.operator.findFirstOrThrow({ where: { gymId, user: { username: `pending_${suffix}` } } });
  browser("click", `[aria-controls="disable-confirmation-${pending.id}"]`); click("Confirm disable"); text("Staff disabled. Current sessions and links revoked."); capture("team-without-password-confirmation");
  click("Account: Settings Owner, Owner");
  evaluate("window.originalSettingsFetch=window.fetch;window.fetch=(...args)=>String(args[0]).includes('/api/auth/sign-out')?Promise.reject(new Error('Synthetic connection failure')):window.originalSettingsFetch(...args);true");
  browser("find", "role", "menuitem", "click", "--name", "Log out", "--exact"); text("Unable to log out. Try again."); capture("logout-error");
  evaluate("window.fetch=window.originalSettingsFetch;true"); browser("find", "role", "menuitem", "click", "--name", "Log out", "--exact"); browser("wait", "--url", `${origin}/login?signedOut=true`);
  login(`settings_${suffix}`, true); text("Ready for your shift"); browser("open", `${origin}/settings`); text("Gym profile");
  assert.equal(evaluate("Array.from(document.querySelectorAll('button')).some(e=>e.textContent==='Edit profile')"), false);
  assert.equal(evaluate("document.querySelector('a[href=\"/settings/plans\"]')===null"), true); capture("staff-profile");
  browser("open", `${origin}/settings/plans`); browser("wait", "--url", `${origin}/settings`);
  click("Account: Settings Staff, Staff"); browser("find", "role", "menuitem", "click", "--name", "Log out", "--exact"); browser("wait", "--url", `${origin}/login?signedOut=true`);
  browser("open", `${origin}/settings`); browser("wait", "--url", `${origin}/login`);
  console.log("Settings browser: PASS (themes, responsive pages, menu keyboard, profile save/reload/validation/conflicts, pricing, staff/anonymous gates, logout retry)");
} finally { try { browser("close"); } finally { await db.$disconnect(); await admin.$disconnect(); } }
