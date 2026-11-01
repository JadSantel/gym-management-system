import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { bootstrapSyntheticOwner } from "../src/lib/identity";
import { assertSynthetic } from "../src/lib/email";
import { db } from "../src/lib/db";

assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/gym_crm_synthetic");
}
const origin = "http://127.0.0.1:3000";
assert.equal(process.env.BETTER_AUTH_URL, origin);
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }) });
const session = `gym-login-${randomUUID().slice(0, 8)}`;
const output = resolve(".local/login-01");
mkdirSync(output, { recursive: true });
function browser(...args: string[]) {
  const result = spawnSync(resolve(".local/browser-tools/agent-browser-win32-x64.exe"), ["--session", session, ...args], { encoding: "utf8", windowsHide: true, timeout: 45_000 });
  if (result.status !== 0) throw new Error(`Login browser step '${args[0]}' failed; output withheld to protect credentials.`);
  return result.stdout;
}
function evaluate(code: string) { return JSON.parse(browser("eval", code, "--json")).data.result; }
function click(name: string) { browser("find", "role", "button", "click", "--name", name, "--exact"); }
function audit() {
  assert.equal(evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  const result = JSON.parse(browser("a11y", "--tags", "wcag2a,wcag2aa", "--json")).data;
  assert.equal(result.counts.violations, 0);
  assert.equal(result.counts.incomplete, 0);
}
try {
  browser("open", `${origin}/login?signedOut=true`);
  browser("wait", "--text", "You are signed out.");
  for (const theme of ["light", "dark"]) {
    browser("select", "select[aria-label=Appearance]", theme);
    browser("reload");
    browser("wait", "--text", "Sign in to your gym");
    assert.equal(evaluate("document.documentElement.classList.contains('dark')"), theme === "dark");
    for (const [name, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1024], ["phone", 375, 812], ["narrow", 320, 812]] as const) {
      browser("set", "viewport", String(width), String(height));
      audit();
      browser("screenshot", "body", resolve(output, `${theme}-${name}.png`), "--full");
    }
    browser("click", "input[value=username]");
    assert.equal(evaluate("document.querySelector('#identifier').type"), "text");
    assert.equal(evaluate("document.body.textContent.includes('ask your gym owner to send a reset link')"), true);
    audit();
    browser("click", "input[value=email]");
    browser("focus", "#identifier"); browser("press", "Tab");
    assert.equal(evaluate("document.activeElement.textContent"), "Forgot your password?");
    browser("press", "Enter");
    click("Request recovery link");
    browser("wait", "--text", "Check your email below.");
    assert.equal(evaluate("document.activeElement.id"), "identity-login-feedback");
    assert.equal(evaluate("document.querySelector('#identifier').getAttribute('aria-invalid')"), "true");
    browser("fill", "#identifier", `unknown-${randomUUID()}@example.test`);
    click("Request recovery link");
    browser("wait", "--text", "If an active owner account matches, its recovery link has been captured.");
    audit();
    browser("screenshot", "body", resolve(output, `${theme}-recovery.png`), "--full");
    click("Back to sign in");
  }
  browser("fill", "#identifier", `unknown-${randomUUID()}@example.test`);
  browser("fill", "#password", "Incorrect synthetic password!"); click("Sign in");
  browser("wait", "--text", "Unable to sign in. Check your credentials or contact your owner.");
  assert.equal(evaluate("document.querySelector('#password').value"), "");
  audit();
  let setupUrl = "";
  const email = `login-${randomUUID()}@example.test`;
  const password = "Synthetic login browser password!";
  await bootstrapSyntheticOwner({ gymId: randomUUID(), gymName: "Synthetic Login Gym", email, name: "Login Owner" }, { async send(message) { setupUrl = message.url; } }, admin);
  browser("open", setupUrl);
  browser("fill", "#password", password); browser("fill", "#confirmation", password); click("Save private password");
  browser("wait", "--text", "Your password is ready"); browser("open", `${origin}/login`);
  browser("fill", "#identifier", email); browser("fill", "#password", password); click("Sign in");
  browser("wait", "--text", "Welcome, Login Owner");
  console.log("PASS: both themes at desktop/tablet/phone/320px, persistence, axe/reflow, signed-out, staff mode, keyboard recovery, invalid recovery, generic recovery, wrong credentials/password clearing, real owner sign-in.");
} finally {
  browser("close");
  await admin.$disconnect();
  await db.$disconnect();
}
