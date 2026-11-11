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

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic");
}
const origin = "http://127.0.0.1:3000", suffix = randomUUID().slice(0, 8), session = `theme-${suffix}`;
assert.equal(process.env.BETTER_AUTH_URL, origin);
const output = resolve(".impeccable/review/theme"); mkdirSync(output, { recursive: true });
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
const password = "Synthetic theme password 2026!", email = `theme-${suffix}@example.test`;
function browser(...args: string[]): string {
  const result = spawnSync(resolve(".local/browser-tools/agent-browser-win32-x64.exe"), ["--session", session, ...args], { encoding: "utf8", windowsHide: true, timeout: 45000 });
  if (result.status !== 0) throw new Error(`Browser ${args[0]} failed: ${result.stderr}`);
  if (["open", "reload"].includes(args[0])) {
    browser("wait", "--load", "load");
    browser("wait", "--fn", "(()=>{const ids=Array.from(document.querySelectorAll('[id]')).map(e=>e.id);return !!document.querySelector('h1')&&!document.querySelector('[aria-label^=Loading]')&&new Set(ids).size===ids.length})()");
    evaluate("document.querySelectorAll('nextjs-portal').forEach(e=>e.style.display='none');true");
  }
  if (args[0] === "screenshot" && args[1]) { const file = result.stdout.match(/Screenshot saved to (.+)/)?.[1]?.trim(); if (file && file !== args[1]) copyFileSync(file, args[1]); }
  return result.stdout;
}
const evaluate = (code: string) => JSON.parse(browser("eval", code, "--json")).data.result;
const click = (name: string) => browser("find", "role", "button", "click", "--name", name, "--exact");
const text = (value: string) => browser("wait", "--text", value);
const auditEvidence: unknown[] = [];
const auditFailures: { label: string; violations: unknown[]; incomplete: unknown[] }[] = [];
function capture(label: string) {
  evaluate("(async()=>{await document.fonts.ready;return true})()");
  assert.equal(evaluate("document.documentElement.scrollWidth<=innerWidth && document.querySelector('#main').scrollWidth<=document.querySelector('#main').clientWidth"), true, `${label} overflow`);
  assert.match(evaluate("getComputedStyle(document.body).fontFamily"), /Inter/);
  assert.equal(evaluate("['--background','--foreground','--primary','--chart-1','--radius'].every(name=>getComputedStyle(document.documentElement).getPropertyValue(name).trim().length>0)"), true);
  assert.equal(evaluate("document.fonts.check('14px Inter')"), true);
  const modal = evaluate("!!document.querySelector('[role=dialog][data-mobile=true]')");
  if (modal) {
    const count = evaluate("document.querySelector('[role=dialog]').querySelectorAll('a[href],button:not(:disabled),[tabindex=\"0\"]').length");
    for (let step = 0; step <= count; step++) {
      browser("press", "Tab");
      assert.equal(evaluate("!!document.activeElement.closest('[role=dialog]')"), true, `${label} modal keyboard cycle`);
    }
    browser("press", "Shift+Tab");
    assert.equal(evaluate("!!document.activeElement.closest('[role=dialog]')"), true);
  }
  const audit = JSON.parse(browser("a11y", "--tags", "wcag2a,wcag2aa", "--json")).data;

  const unresolved = audit.incomplete.filter((issue: { id: string; nodes: { target: string[] }[] }) => {
    if (issue.id === "aria-hidden-focus" && modal) {
      // Radix hides the background and uses focus guards; the complete Tab cycle
      // above proves these hidden background controls cannot retain keyboard focus.
      return !issue.nodes.every(node => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(node.target[0])});const dialog=document.querySelector('[role=dialog][data-mobile=true]');return e?.getAttribute('aria-hidden')==='true'&&!dialog.contains(e)})()`));
    }
    if (issue.id !== "color-contrast" || !label.endsWith("-attendance")) return true;
    // Axe cannot infer the SVG tick background. Resolve only visible Recharts
    // axis text on the known opaque panel, with an executable contrast check.
    return !issue.nodes.every(node => evaluate(`(()=>{
      const tick=document.querySelector(${JSON.stringify(node.target[0])});
      if(!tick?.closest('[data-slot=chart][aria-label^="Hourly peak occupancy for"]') || tick.tagName!=='tspan' || !tick.getBoundingClientRect().height)return false;
      const panel=tick.closest('[data-slot=card]');if(!panel)return false;
      const ctx=document.createElement('canvas').getContext('2d');
      const luminance=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const rgba=ctx.getImageData(0,0,1,1).data;if(rgba[3]!==255)throw Error('Unknown contrast background');const rgb=Array.from(rgba).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
      const a=luminance(getComputedStyle(tick).fill),b=luminance(getComputedStyle(panel).backgroundColor);
      return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5;
    })()`));
  });
  auditEvidence.push({label, counts:audit.counts, resolved: audit.incomplete.filter((issue: unknown)=>!unresolved.includes(issue))});
  if (audit.violations.length || unresolved.length) auditFailures.push({ label, violations: audit.violations, incomplete: unresolved });
  browser("screenshot", resolve(output, `${label}.png`), "--full");
  console.log(`${audit.violations.length || unresolved.length ? "FAIL" : "PASS"} ${label}`);
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
  await bootstrapSyntheticOwner({ gymId, gymName: "Synthetic Theme Gym", name: "Theme Owner", email }, sender, admin);
  await completeSetup(token, password);
  login(email); text("Welcome, Theme Owner");
  for (const theme of ["Light", "Dark"]) {
    click("Appearance"); click(theme); browser("reload"); text("Welcome, Theme Owner");
    assert.equal(evaluate("document.documentElement.classList.contains('dark')"), theme === "Dark");
    for (const width of [1440, 1024, 768, 390, 320]) {
      browser("set", "viewport", String(width), "1000");
      for (const [path, ready] of [["/", "Welcome, Theme Owner"], ["/members", "Members"], ["/transactions", "Payments"], ["/settings", "Gym profile"], ["/attendance", "Attendance"]]) {
        browser("open", `${origin}${path}`); text(ready);
        browser("wait", "--fn", "document.querySelector('h1')?.getBoundingClientRect().height>0 && !document.querySelector('[aria-label^=Loading]')");
        capture(`${theme}-${width}-${path.slice(1) || "dashboard"}`);
        if (path === "/members") assert.equal(evaluate("document.querySelector('td[colspan]').getBoundingClientRect().width>=document.querySelector('[data-slot=table-container]').clientWidth-40"), true, `${theme}-${width} full-width empty state`);
        if (path === "/settings" && width === 320) assert.equal(evaluate("getComputedStyle(Array.from(document.querySelectorAll('p')).find(e=>e.textContent==='No contact email recorded')).wordBreak"), "normal");
        if (path === "/members" && width === 1024 && evaluate("document.querySelector('[data-slot=table-container]').scrollWidth>document.querySelector('[data-slot=table-container]').clientWidth")) {
          browser("focus", '[data-slot="table-container"]'); browser("press", "ArrowRight");
          browser("wait", "--fn", "document.querySelector('[data-slot=table-container]').scrollLeft>0");
        }
      }
      browser("open", origin); text("Welcome, Theme Owner");
      if (width >= 1024) {
        assert.equal(evaluate("document.querySelector('[data-slot=sidebar][data-variant]').dataset.variant"), "sidebar");
        assert.equal(evaluate("document.querySelector('[data-slot=sidebar-container]').getBoundingClientRect().width"), 256);
        assert.equal(evaluate("document.querySelectorAll('[aria-label=\"Main navigation\"] [data-sidebar=group]').length"), 3);
        assert.equal(evaluate("document.querySelector('[aria-label=\"Main navigation\"] [data-sidebar=menu-sub]')===null"), true);
        assert.deepEqual(evaluate("Array.from(document.querySelectorAll('[aria-label=\"Main navigation\"] a')).map(e=>e.textContent.trim())"), ["Add Members", "Record Payment", "Dashboard", "Members", "Payments", "Attendance", "QR Scanner"]);
        assert.equal(evaluate("document.querySelector('[aria-label=\"Main navigation\"] [aria-disabled=true]').closest('a')===null"), true);
        browser("focus", '[data-sidebar="trigger"]'); browser("press", "Enter");
        assert.equal(evaluate("document.querySelector('[data-slot=sidebar][data-variant]').dataset.state"), "collapsed");
        capture(`${theme}-${width}-collapsed`);
        browser("press", "Enter");
      } else {
        click("Toggle Sidebar"); browser("wait", "--fn", "document.querySelector('[role=dialog]')?.getBoundingClientRect().width>0");
        capture(`${theme}-${width}-drawer`);
        browser("press", "Tab");
        assert.equal(evaluate("document.activeElement.closest('[role=dialog]')!==null"), true);
        browser("press", "Escape"); browser("wait", "--fn", "!document.querySelector('[role=dialog]')");
        assert.equal(evaluate("document.activeElement.dataset.sidebar"), "trigger");
        click("Toggle Sidebar"); browser("wait", "--fn", "document.querySelector('[role=dialog]')?.getBoundingClientRect().width>0");
        browser("click", '[role=dialog] a[href="/members"]'); browser("wait", "--url", `${origin}/members`);
        browser("wait", "--fn", "!document.querySelector('[role=dialog]')");
        assert.equal(evaluate("document.querySelector('[aria-label=\"Quick navigation\"] [aria-current=page]').textContent.trim()"), "Members");
      }
      click("Account: Theme Owner, Owner");
      assert.deepEqual(evaluate("Array.from(document.querySelectorAll('[role=menuitem]')).map(e=>e.textContent.trim())"), ["Settings", "Log out"]);
      browser("press", "Escape");
      assert.equal(evaluate("document.activeElement.getAttribute('aria-label')"), "Account: Theme Owner, Owner");
      browser("open", origin); text("Welcome, Theme Owner");
    }
  }
  browser("set", "viewport", "1440", "1000");
  click("Appearance"); click("System"); browser("reload"); text("Welcome, Theme Owner");
  assert.equal(evaluate("localStorage.getItem('gym-appearance')==='system' && document.documentElement.classList.contains('dark')===matchMedia('(prefers-color-scheme: dark)').matches"), true);
  const response = await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ email, password }) }));
  assert.equal(response.status, 200);
  const owner = new Headers({ cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") });
  await inviteStaff(owner, { name: "Theme Staff", email: `theme-staff-${suffix}@example.test`, username: `theme_${suffix}` }, sender); await completeSetup(token, password);
  click("Account: Theme Owner, Owner"); browser("find", "role", "menuitem", "click", "--name", "Log out", "--exact"); browser("wait", "--url", `${origin}/login?signedOut=true`);
  login(`theme_${suffix}`, true); text("Ready for your shift");
  assert.equal(evaluate("document.querySelector('[aria-label=\"Main navigation\"] a[href=\"/\"]')===null"), true);
  assert.equal(evaluate("document.querySelector('[aria-label=\"Main navigation\"]')?.textContent.includes('Reports')"), false);
  assert.equal(evaluate("document.querySelector('[aria-label=\"Main navigation\"] a[href=\"/members\"]')===null"), true);
  browser("open", `${origin}/members`); browser("wait", "--url", `${origin}/settings/team`); text("Ready for your shift"); capture("staff-members-denied");
  click("Account: Theme Staff, Staff"); browser("find", "role", "menuitem", "click", "--name", "Log out", "--exact"); browser("wait", "--url", `${origin}/login?signedOut=true`);
  for (const theme of ["Light", "Dark"]) {
    click("Appearance"); click(theme);
    for (const width of [1440, 768, 320]) {
      browser("set", "viewport", String(width), "1000"); capture(`${theme}-${width}-login`);
    }
  }
  browser("open", `${origin}/members`); browser("wait", "--url", `${origin}/login`);
  assert.deepEqual(auditFailures, [], "Theme matrix accessibility findings");
  console.log("Theme browser: PASS (Nova/Inter, 5 widths, both themes, persistence/System, sidebar-01 groups, collapse/drawer/focus/navigation, account menu, permission and anonymous gates)");
} finally { writeFileSync(resolve(output, "audits.json"), JSON.stringify({failures:auditFailures,evidence:auditEvidence}, null, 2)); try { browser("close"); } finally { await db.$disconnect(); await admin.$disconnect(); } }
