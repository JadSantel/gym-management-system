import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { bootstrapSyntheticOwner } from "../src/lib/identity";
import { assertSynthetic, type EmailSender } from "../src/lib/email";
import { db } from "../src/lib/db";

assertSynthetic();
const binary = process.env.AGENT_BROWSER_BIN;
if (!binary) throw new Error("Set AGENT_BROWSER_BIN to an installed agent-browser 0.39.2 executable. Start npm run dev first.");
const session = `gym-identity-${randomUUID().slice(0, 8)}`;
const origin = process.env.BETTER_AUTH_URL!;
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
const suffix = randomUUID().slice(0, 8);
const email = `browser-owner-${suffix}@example.test`;
const staffEmail = `browser-staff-${suffix}@example.test`;
const username = `browser_${suffix}`;
const password = "Synthetic browser password 2026!";
let ownerUrl = "";
const sender: EmailSender = { async send(message) { ownerUrl = message.url; } };

function browser(...args: string[]) {
  const result = spawnSync(binary!, ["--session", session, ...args], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
  // Never emit full CLI arguments/output: setup URLs contain captured synthetic bearer tokens.
  if (result.status !== 0) throw new Error(`Browser step '${args[0]}' failed. Output withheld to protect captured links.`);
  return result.stdout;
}
function checkText(value: string) { browser("wait", "--text", value); }
function clickButton(name: string) { browser("find", "role", "button", "click", "--name", name, "--exact"); }
function fill(selector: string, value: string) { browser("fill", selector, value); }
function audit(page: string) {
  const result = JSON.parse(browser("a11y", "--tags", "wcag2a,wcag2aa", "--json"));
  if (result.data.counts.incomplete) console.log(JSON.stringify(result.data.incomplete.map((item: { id: string; nodes: { target: string[]; failureSummary: string }[] }) => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))));
  assert.equal(result.data.counts.violations, 0, `${page} accessibility violations`);
  assert.equal(result.data.counts.incomplete, 0, `${page} incomplete accessibility checks`);
  console.log(`${page}: axe WCAG A/AA checks passed.`);
}
function evalBrowser(code: string) {
  const result = JSON.parse(browser("eval", code, "--json"));
  if (!result.success) throw new Error("Browser evaluation failed.");
  return result.data.result;
}
async function capturedUrl(operatorId: string) {
  const invitation = await admin.invitation.findFirstOrThrow({ where: { operatorId, consumedAt: null, sentAt: { not: null } }, orderBy: { createdAt: "desc" } });
  return JSON.parse(readFileSync(resolve(".local/mailbox", `${invitation.id}.json`), "utf8")).url as string;
}

try {
  await admin.rateLimit.deleteMany();
  const gymId = randomUUID();
  await bootstrapSyntheticOwner({ gymId, gymName: "Synthetic Browser Gym", email, name: "Browser Owner" }, sender, admin);
  for (const path of ["sign-up/email", "reset-password", "change-password", "update-user"]) {
    const response = await fetch(`${origin}/api/auth/${path}`, { method: "POST", headers: { "content-type": "application/json", origin }, body: "{}" });
    assert.equal(response.status, 404, `Unreviewed provider route ${path} must be blocked`);
  }
  assert.equal((await fetch(`${origin}/api/identity/operators`)).status, 401);
  assert.equal((await fetch(`${origin}/api/identity/invite`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ name: "Intruder", email: staffEmail, username }) })).status, 401);
  assert.equal((await fetch(`${origin}/api/identity/setup`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: "{}" })).status, 403);
  assert.equal((await fetch(`${origin}/api/identity/setup`, { method: "POST", headers: { "content-type": "application/json", origin }, body: "x".repeat(5000) })).status, 413);
  console.log("Direct HTTP: signup/provider bypass, anonymous administration, foreign origin, and oversized body denied.");

  browser("open", `${origin}/login`); audit("Login");
  browser("set", "viewport", "375", "812");
  assert.equal(evalBrowser("document.documentElement.scrollWidth <= window.innerWidth"), true);
  browser("press", "Tab");
  assert.equal(evalBrowser("document.activeElement?.textContent === 'Skip to content'"), true);
  browser("set", "viewport", "1280", "900");

  browser("open", ownerUrl);
  audit("Setup");
  fill("#password", password); fill("#confirmation", password);
  clickButton("Save private password"); checkText("Your password is ready");
  browser("open", `${origin}/login`); browser("open", ownerUrl); fill("#password", password); fill("#confirmation", password);
  clickButton("Save private password"); checkText("Link expired, replaced, or already used.");
  browser("open", `${origin}/login`);
  fill("#identifier", email); fill("#password", "incorrect password"); clickButton("Sign in"); checkText("Unable to sign in.");
  fill("#password", password); clickButton("Sign in"); checkText("Welcome, Browser Owner");
  fill("#reauth-password", password); clickButton("Verify password"); checkText("Password verified for five minutes.");
  fill("#staff-name", "Browser Staff"); fill("#staff-username", username); fill("#staff-email", staffEmail);
  clickButton("Send invitation"); checkText("Link captured for the recipient."); checkText("Pending setup");
  audit("Owner settings");
  browser("set", "viewport", "375", "812");
  assert.equal(evalBrowser("document.documentElement.scrollWidth <= window.innerWidth"), true);
  browser("screenshot", resolve(".local/identity-owner-mobile.png"));
  browser("set", "viewport", "1280", "900");
  const staff = await admin.operator.findFirstOrThrow({ where: { gymId, role: "STAFF" } });
  const staffUrl = await capturedUrl(staff.id);
  clickButton("Sign out"); checkText("You are signed out.");
  browser("open", staffUrl); fill("#password", password); fill("#confirmation", password);
  clickButton("Save private password"); checkText("Your password is ready");
  browser("open", `${origin}/login`); browser("find", "role", "radio", "click", "--name", "Staff", "--exact");
  fill("#identifier", username); fill("#password", password); clickButton("Sign in"); checkText("Welcome, Browser Staff");
  audit("Staff landing");
  assert.equal(evalBrowser("fetch('/api/identity/operators').then(r => r.status)"), 403);
  for (const action of ["reset-staff", "disable"]) {
    assert.equal(evalBrowser(`fetch('/api/identity/${action}', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operatorId:'${staff.id}'})}).then(r=>r.status)`), 403);
  }
  assert.equal(evalBrowser(`fetch('/api/identity/capabilities', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operatorId:'${staff.id}',canManageMembers:true,canCollectCash:true})}).then(r=>r.status)`), 403);
  clickButton("Sign out"); checkText("You are signed out.");
  fill("#identifier", email); fill("#password", password); clickButton("Sign in"); checkText("Welcome, Browser Owner");
  fill("#reauth-password", password); clickButton("Verify password"); checkText("Password verified for five minutes.");
  browser("check", "input[name=members]"); browser("check", "input[name=cash]"); clickButton("Save permissions"); checkText("Staff permissions saved.");
  assert.equal((await admin.operator.findUniqueOrThrow({ where: { id: staff.id } })).canCollectCash, true);
  browser("uncheck", "input[name=cash]"); clickButton("Save permissions"); checkText("Staff permissions saved.");
  assert.equal((await admin.operator.findUniqueOrThrow({ where: { id: staff.id } })).canCollectCash, false);
  browser("find", "role", "link", "click", "--name", "Find or create a member", "--exact"); checkText("Find a member");
  fill("#member-name", "Browser Synthetic Member"); clickButton("Create member"); checkText("Member created.");
  clickButton("Create member"); checkText("A member with this name exists.");
  browser("check", "input[name=confirmDuplicate]"); clickButton("Create member"); checkText("Member created.");
  audit("Member directory");
  browser("find", "role", "link", "click", "--name", "Browser Synthetic Member", "--exact"); checkText("No confirmed membership");
  browser("open", origin); checkText("Welcome, Browser Owner");
  clickButton("Send reset link"); checkText("Link captured for the recipient.");
  const resetUrl = await capturedUrl(staff.id);
  clickButton("Disable staff"); clickButton("Confirm disable"); checkText("Staff disabled.");
  browser("open", resetUrl); fill("#password", password); fill("#confirmation", password); clickButton("Save private password"); checkText("Link expired, replaced, or already used.");
  browser("find", "role", "link", "click", "--name", "Back to sign in", "--exact");
  console.log("Browser flow: owner setup, replay denial, wrong-password denial, owner/staff login, invite, reauth, reset initiation, disable, and disabled-link denial passed.");
} finally {
  try { browser("close"); } finally { await db.$disconnect(); await admin.$disconnect(); }
}
