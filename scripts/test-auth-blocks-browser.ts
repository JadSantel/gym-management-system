import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { assertSynthetic } from "../src/lib/email";
import { db } from "../src/lib/db";

assertSynthetic();
const origin = "http://127.0.0.1:3000";
assert.equal(process.env.BETTER_AUTH_URL, origin);
const session = `auth-blocks-${randomUUID().slice(0, 8)}`;
const output = resolve(".local/auth-blocks");
mkdirSync(output, { recursive: true });
function browser(...args: string[]) {
  const result = spawnSync(resolve(".local/browser-tools/agent-browser-win32-x64.exe"), ["--session", session, ...args], { encoding: "utf8", windowsHide: true, timeout: 45_000 });
  if (result.status !== 0) throw new Error(`Browser ${args[0]} failed: ${result.stderr}`);
  return result.stdout;
}
const evaluate = (code: string) => JSON.parse(browser("eval", code, "--json")).data.result;
const click = (name: string) => browser("find", "role", "button", "click", "--name", name, "--exact");
function capture(label: string) {
  const result = browser("screenshot", "--full");
  const path = result.match(/Screenshot saved to (.+)/)?.[1]?.trim();
  assert.ok(path);
  copyFileSync(path, resolve(output, `${label}.png`));
}
function audit(label: string) {
  assert.equal(evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `${label}: overflow`);
  const result = JSON.parse(browser("a11y", "--tags", "wcag2a,wcag2aa", "--json")).data;
  assert.equal(result.counts.violations, 0, `${label}: ${JSON.stringify(result.violations)}`);
  assert.equal(result.counts.incomplete, 0, `${label}: ${JSON.stringify(result.incomplete)}`);
}
try {
  for (const route of ["login", "signup"]) {
    browser("open", `${origin}/${route}`);
    browser("wait", `[data-auth-block='${route}-03']`);
    assert.equal(evaluate("document.querySelectorAll('h1').length"), 1);
    for (const theme of ["light", "dark"]) {
      click("Appearance"); click(theme === "light" ? "Light" : "Dark");
      browser("reload"); browser("wait", `[data-auth-block='${route}-03']`);
      assert.equal(evaluate("document.documentElement.classList.contains('dark')"), theme === "dark");
      for (const [name, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1024], ["phone", 375, 812], ["narrow", 320, 812]] as const) {
        browser("set", "viewport", String(width), String(height));
        audit(`${route}-${theme}-${name}`); capture(`${route}-${theme}-${name}`);
      }
    }
  }
  browser("fill", "#gymName", `Synthetic browser gym ${randomUUID().slice(0, 8)}`);
  browser("fill", "#ownerName", "Synthetic Browser Owner");
  browser("fill", "#email", "synthetic-browser@example.com");
  click("Submit request"); browser("wait", "--text", "Use a reserved synthetic .test email address.");
  assert.equal(evaluate("document.querySelector('#email').getAttribute('aria-invalid')"), "true");
  assert.equal(evaluate("document.activeElement.id"), "onboarding-request-feedback");
  audit("signup-error"); capture("signup-error");
  browser("fill", "#email", `synthetic-browser-${randomUUID()}@example.test`);
  click("Submit request"); browser("wait", "--text", "Your request was received.");
  audit("signup-success"); capture("signup-success");
  browser("find", "role", "link", "click", "--name", "Sign in", "--exact");
  browser("wait", "--url", "**/login");
  browser("wait", "[data-auth-block='login-03']", "--timeout", "60000");
  browser("click", "input[value=username]");
  assert.equal(evaluate("document.querySelector('#identifier').type"), "text");
  browser("click", "input[value=email]");
  browser("focus", "#identifier"); browser("press", "Tab");
  assert.equal(evaluate("document.activeElement.textContent"), "Forgot your password?");
  browser("press", "Enter"); click("Request recovery link");
  browser("wait", "--text", "Check your email below.");
  audit("login-recovery-error"); capture("login-recovery-error");
  console.log("PASS: official login-03/signup-03 compositions, both themes at 1440/768/375/320, persisted appearance, zero axe violations/incompletes, request errors/success, links, Staff mode and keyboard recovery.");
} finally { browser("close"); await db.$disconnect(); }
