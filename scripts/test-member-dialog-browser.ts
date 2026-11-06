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
const suffix = randomUUID().slice(0, 8), gymId = randomUUID();
const email = `dialog-${suffix}@example.test`, password = "Synthetic dialog password 2026!";
const binary = resolve(".local/browser-tools/agent-browser-win32-x64.exe"), session = `member-dialog-${suffix}`;
const output = resolve(".local/member-dialog"); mkdirSync(output, { recursive: true });
function browser(...args: string[]): string {
  const result = spawnSync(binary, ["--session", session, ...args], { encoding: "utf8", windowsHide: true, timeout: 45_000 });
  if (result.status !== 0) throw new Error(`Member dialog browser '${args[0]}' failed; output withheld to protect credentials.`);
  return result.stdout;
}
function evaluate(code: string) { return JSON.parse(browser("eval", code, "--json")).data.result; }
function click(name: string) { browser("find", "role", "button", "click", "--name", name, "--exact"); }
function wait(code: string) { browser("wait", "--fn", code); }
function opened() { wait("!!document.querySelector('[role=dialog] #member-name') && document.activeElement.id==='member-name'"); }
function closed() { wait("!document.querySelector('[role=dialog]') && !location.search"); }
function audit(label: string) {
  assert.equal(evaluate("document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('[role=dialog]')].every(d=>{const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&d.scrollWidth<=d.clientWidth;})"), true, `${label} bounds`);
  const result = JSON.parse(browser("a11y", "--selector", "[role=dialog]", "--tags", "wcag2a,wcag2aa", "--json")).data;
  assert.equal(result.counts.violations, 0, `${label} axe violations: ${JSON.stringify(result.violations)}`);
  // Independently verify modal focus containment when axe cannot infer background inertness.
  const contrast = result.incomplete?.filter((item: { id: string; nodes: { target: string[]; failureSummary: string }[] }) => item.id === "color-contrast" && item.nodes.every(node => node.target.length === 1 && node.failureSummary.includes("partially overlaps"))) ?? [];
  if (contrast.length) {
    // Resolve overlap incompletes using the actual opaque surface and text hit targets.
    const selectors = contrast.flatMap((item: { nodes: { target: string[] }[] }) => item.nodes.map(node => node.target[0]));
    const checked = evaluate(`(() => {
      const dialog=document.querySelector('[role=dialog]');
      const luminance=color=>{const rgb=color.match(/[\\d.]+/g).slice(0,3).map(v=>{const s=Number(v)/255;return s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4});return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722};
      return ${JSON.stringify(selectors)}.map(selector=>{
        const node=dialog.querySelector(selector);if(!node)return {selector,visible:false};node.scrollIntoView({block:'center'});
        let surface=node;while(surface!==dialog&&!/^rgb\\(/.test(getComputedStyle(surface).backgroundColor))surface=surface.parentElement;
        const background=getComputedStyle(surface).backgroundColor, foreground=getComputedStyle(node).color;
        const a=luminance(background), b=luminance(foreground), range=document.createRange();range.selectNodeContents(node);
        return {selector,opaque:/^rgb\\(/.test(background),ratio:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05),visible:[...range.getClientRects()].every(r=>node.contains(document.elementFromPoint(r.left+2,r.top+r.height/2)))};
      });
    })()`);
    assert.equal(checked.every((node: { opaque: boolean; visible: boolean; ratio: number }) => node.opaque && node.visible && node.ratio >= 4.5), true, `${label} measured contrast/visibility: ${JSON.stringify(checked)}`);
    console.log(`${label}: ${checked.length} axe overlap incomplete(s) independently checked for contrast and visible text.`);
  }
  const uncertain = result.incomplete?.filter((item: { id: string }) => item.id !== "aria-hidden-focus" && !contrast.includes(item)) ?? [];
  assert.equal(uncertain.length, 0, `${label} axe incomplete: ${JSON.stringify(uncertain)}`);
  const stops = "[...document.querySelector('[role=dialog]').querySelectorAll('input:not([disabled]),button:not([disabled]),a[href]')].filter(n=>n.getClientRects().length)";
  evaluate(`(${stops}).at(-1).focus(); true`); browser("press", "Tab");
  assert.equal(evaluate(`document.activeElement===(${stops})[0]`), true, `${label} Tab wraps`);
  browser("press", "Shift+Tab");
  assert.equal(evaluate(`document.activeElement===(${stops}).at(-1)`), true, `${label} Shift+Tab wraps`);
}
try {
  let token = "";
  await bootstrapSyntheticOwner({ gymId, gymName: "Synthetic Dialog Gym", name: "Dialog Operator", email }, { async send(message) { token = new URL(message.url).hash.slice(1); } }, admin);
  await completeSetup(token, password);
  console.log("Synthetic dialog fixture ready.");
  browser("open", `${origin}/login`); browser("fill", "#identifier", email); browser("fill", "#password", password); click("Sign in");
  browser("wait", "--text", "Welcome, Dialog Operator");
  browser("open", `${origin}/members`); browser("wait", "#search-name");
  console.log("Members directory loaded.");
  if (process.argv.includes("--baseline")) {
    for (const theme of ["light", "dark"]) {
      click("Appearance"); click(theme === "light" ? "Light" : "Dark");
      browser("set", "viewport", "1440", "1000");
      browser("screenshot", resolve(output, `before-${theme}.png`));
    }
  } else {
    assert.equal(evaluate("!!document.getElementById('member-name')"), false, "No inline registration form");
    for (const theme of ["light", "dark"]) {
      click("Appearance"); click(theme === "light" ? "Light" : "Dark"); browser("reload"); browser("wait", "#search-name");
      assert.equal(evaluate("document.documentElement.classList.contains('dark')"), theme === "dark", "Theme persists");
      for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1024], ["phone", 375, 812], ["narrow", 320, 640]] as const) {
        browser("set", "viewport", String(width), String(height)); click("Add member"); opened();
        browser("screenshot", resolve(output, `${theme}-${device}.png`));
        audit(`${theme} ${device}`);
        console.log(`PASS: ${theme} ${device} dialog accessibility and focus.`);
        browser("press", "Escape"); closed();
        assert.equal(evaluate("document.activeElement.textContent.includes('Add member')"), true, "Focus returns to Add member");
        if (width < 1024) click("Toggle Sidebar");
        browser("find", "role", "link", "click", "--name", "Add Members", "--exact"); opened();
        assert.equal(evaluate("document.querySelectorAll('[role=dialog]').length"), 1, "Mobile sidebar closes before registration");
        click("Cancel"); closed();
      }
    }
    browser("set", "viewport", "1440", "1000"); browser("open", origin);
    browser("find", "role", "link", "click", "--name", "Add Members", "--exact"); opened();
    assert.equal(evaluate("location.pathname"), "/members", "Quick action from another route");
    click("Create member"); browser("wait", "--text", "Check the member fields below.");
    assert.equal(evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)"), true, "Validation feedback stays in dialog");
    const fullName = `Dialog Member ${suffix}`;
    browser("fill", "#member-name", fullName); browser("fill", "#member-phone", "123"); click("Create member");
    browser("wait", "--text", "Enter a Philippine mobile number");
    assert.equal(await admin.member.count({ where: { gymId } }), 0);
    browser("fill", "#member-phone", ""); click("Create member"); closed();
    browser("wait", "--text", "Member created. Review the member record before collecting payment.");
    assert.equal(evaluate("document.querySelector('main').innerText.includes('Pending')"), true);
    const member = await admin.member.findFirstOrThrow({ where: { gymId, fullName } });
    assert.equal(await admin.payment.count({ where: { memberId: member.id } }), 0);
    assert.equal(await admin.effectiveEntitlement.count({ where: { memberId: member.id } }), 0);
    browser("find", "role", "link", "click", "--name", "Add Members", "--exact"); opened();
    assert.equal(evaluate("document.querySelector('[role=dialog]').innerText.includes('Member created.')"), false, "Reopening from sidebar has no stale success feedback");
    browser("fill", "#member-name", fullName); click("Create member");
    browser("wait", "#duplicate-review");
    assert.equal(evaluate("!!document.querySelector('[role=dialog] a[href=\"/members/' + " + JSON.stringify(member.id) + " + '\"]')"), true, "Duplicate matches reviewable inside modal");
    audit("duplicate review"); browser("screenshot", resolve(output, "duplicate-review.png"));
    click("Create member"); browser("wait", "--text", "Review the matching members");
    assert.equal(await admin.member.count({ where: { gymId, fullName } }), 1);
    click("Cancel"); closed(); click("Add member"); opened();
    assert.equal(evaluate("document.getElementById('member-name').value"), "", "Cancel clears draft and duplicate state");
    assert.equal(evaluate("!!document.getElementById('duplicate-review')"), false);
    browser("network", "route", "**/api/members", "--abort");
    browser("fill", "#member-name", `Network Member ${suffix}`); click("Create member");
    wait("!!document.querySelector('[role=dialog] [role=alert]')");
    assert.equal(evaluate("document.getElementById('member-name').value"), `Network Member ${suffix}`, "Failed submission retains draft");
    browser("network", "unroute"); click("Cancel"); closed();
    console.log("PASS: Both Add member actions; both themes at 1440/768/375/320; focus/Escape/Cancel; validation, duplicates, failure retention and Pending/no payment.");
  }
} finally {
  try { browser("close"); } finally { await admin.$disconnect(); await db.$disconnect(); }
}
