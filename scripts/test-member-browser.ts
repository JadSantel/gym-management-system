import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { BinaryBitmap, DecodeHintType, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { assertSynthetic } from "../src/lib/email";
import { bootstrapSyntheticOwner, completeSetup, reauthenticate } from "../src/lib/identity";
import { registrationLink } from "../src/lib/registration";
import { changePlans } from "../src/lib/plans";
import { memberQr } from "../src/lib/attendance";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";

assertSynthetic();
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }) });
const origin = "http://127.0.0.1:3000", suffix = randomUUID().slice(0, 8), session = `member-${suffix}`;
const output = resolve(".impeccable/review/member"); mkdirSync(output, { recursive: true });
const password = "Synthetic member browser 2026!", email = `member-browser-${suffix}@example.test`, ownerEmail = `member-owner-${suffix}@example.test`;
function browser(...args: string[]) {
  const result = spawnSync(resolve(".local/browser-tools/agent-browser-win32-x64.exe"), ["--session", session, "--download-path", tmpdir(), ...args], { encoding: "utf8", windowsHide: true, timeout: 45000 });
  if (result.status !== 0) throw new Error(`Member browser ${args[0]} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}
const evaluate = (code: string) => JSON.parse(browser("eval", code, "--json")).data.result;
const click = (name: string) => browser("find", "role", "button", "click", "--name", name, "--exact");
const text = (value: string) => browser("wait", "--text", value);
function open(url: string) { browser("open", url); browser("wait", "--load", "load"); }
function theme(value: string) { browser("wait", "button[aria-label='Appearance']"); click("Appearance"); browser("wait", '[role="dialog"]'); click(value); browser("wait", "--fn", "document.getAnimations().every(animation => animation.playState !== 'running')"); }
function separate() { assert.equal(evaluate("!!document.querySelector('[data-member-page]') && !document.querySelector('.app-workspace,[data-sidebar],.mobile-bottom-nav,header time')"), true); }
function audit(label: string) {
  assert.equal(evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `${label} overflow`);
  let result = JSON.parse(browser("a11y", "--tags", "wcag2a,wcag2aa", "--json")).data;
  if (result.counts.incomplete) {
    evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))");
    result = JSON.parse(browser("a11y", "--tags", "wcag2a,wcag2aa", "--json")).data;
  }
  assert.equal(result.counts.violations, 0, `${label}: ${JSON.stringify(result.violations)}`);
  assert.equal(result.counts.incomplete, 0, `${label}: ${JSON.stringify(result.incomplete)}`);
}
function capture(label: string) {
  evaluate("(async()=>{scrollTo(0,0); await document.fonts.ready; await Promise.all(Array.from(document.images,image=>image.decode())); await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); return true;})()");
  const saved = browser("screenshot", "--full").match(/Screenshot saved to (.+)/)?.[1]?.trim(); assert.ok(saved);
  copyFileSync(saved, resolve(output, `${label}.png`));
}
function matrix(surface: string) {
  separate();
  for (const appearance of ["Light", "Dark"]) {
    theme(appearance);
    for (const [device, width, height] of [["desktop",1440,1000],["tablet",768,1000],["phone",375,900]] as const) {
      browser("set", "viewport", String(width), String(height)); audit(`${surface} ${appearance} ${device}`); capture(`${appearance.toLowerCase()}-${surface}-${device}`);
    }
  }
}
async function operatorLogin() {
  await admin.rateLimit.deleteMany();
  open(`${origin}/login`); browser("wait", "#identifier"); browser("fill", "#identifier", ownerEmail); browser("fill", "#password", password); click("Sign in"); browser("wait", "--url", `${origin}/`); text("Welcome, Member Flow Owner");
}
let failure: unknown;
try {
  await admin.rateLimit.deleteMany();
  const gymId = randomUUID(); let setup = "";
  await bootstrapSyntheticOwner({ gymId, gymName: "Synthetic Member Dashboard Gym", name: "Member Flow Owner", email: ownerEmail }, { async send(message) { setup = new URL(message.url).hash.slice(1); } }, admin);
  await completeSetup(setup, password);
  const login = await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type":"application/json", origin }, body: JSON.stringify({ email: ownerEmail, password }) })); assert.equal(login.status, 200);
  const owner = new Headers({ cookie: login.headers.getSetCookie().map(row => row.split(";")[0]).join("; ") });
  await reauthenticate(owner, password); await changePlans(owner, { action: "initialize" });
  const link = await registrationLink(owner, true); assert.ok(link);
  open(link.url); text("Save my profile"); separate();
  browser("set", "viewport", "375", "900"); browser("fill", "#join-name", `Private Member ${suffix}`); browser("fill", "#join-email", email); browser("fill", "#join-phone", "09171234123"); browser("fill", "#join-password", password); browser("fill", "#join-confirmation", password); click("Save my profile"); text("Your profile is saved");
  const member = await admin.member.findFirstOrThrow({ where: { gymId, email } });
  assert.equal(await admin.memberQr.count({ where: { memberId: member.id } }), 0);
  assert.equal(await admin.memberAccount.count({ where: { memberId: member.id } }), 1);
  open(`${origin}/member/login`); browser("fill", "#member-email", email); browser("fill", "#member-password", password); click("Sign in as member"); browser("wait", "--url", `${origin}/member`); text("Pending activation");
  assert.equal(evaluate("document.querySelector('img[alt=\"Your personal attendance QR\"]')"), null);
  assert.equal(evaluate("fetch('/api/member/qr').then(response => response.status)"), 409);
  assert.equal(evaluate("fetch('/api/members/directory').then(response => response.status)"), 403);
  matrix("pending-dashboard"); click("Sign out"); browser("wait", "--url", `${origin}/member/login`);
  await operatorLogin(); open(`${origin}/members/${member.id}`); text("Member dashboard access");
  browser("scrollintoview", "#membership-payment"); click("Prepare charge preview"); text("Saved charge preview"); browser("fill", "#cash-received", "800.00"); click("Review cash payment"); click("Confirm full cash"); text("Full cash payment confirmed");
  const qr = await admin.memberQr.findFirstOrThrow({ where: { memberId: member.id, revokedAt: null } });
  // Verify that the signup password works after activation, without opening any email.
  const memberLogin = await fetch(`${origin}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ email, password }) });
  assert.equal(memberLogin.status, 200);
  const memberCookie = memberLogin.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const privateDashboard = await fetch(`${origin}/api/member/dashboard`, { headers: { cookie: memberCookie } });
  assert.equal(privateDashboard.status, 200); assert.ok((await privateDashboard.json()).qr);
  // Recovery remains optional and validates inbox ownership only when its link is consumed.
  open(`${origin}/members/${member.id}`); browser("scrollintoview", "#member-access-title"); click("Send member password reset"); text("Member email link captured locally.");
  const invitation = await admin.memberInvitation.findFirstOrThrow({ where: { account: { memberId: member.id }, consumedAt: null } });
  const mail = JSON.parse(readFileSync(resolve(".local/mailbox", `${invitation.id}.json`), "utf8")) as { url: string };
  assert.equal(new URL(mail.url).pathname, "/member/setup");
  open(mail.url); text("Choose your password"); matrix("setup");
  browser("fill", "#password", password); browser("fill", "#confirmation", password + "different"); click("Save private password"); text("Passwords must match."); audit("Member setup password mismatch"); capture("dark-setup-error-phone");
  browser("fill", "#password", password); browser("fill", "#confirmation", password); click("Save private password"); text("Your password is ready"); assert.equal(evaluate("location.hash"), "");
  open(`${origin}/member/login`); text("Your gym, your QR"); matrix("login");
  browser("fill", "#member-email", email); browser("fill", "#member-password", "wrong-password"); click("Sign in as member"); text("Unable to sign in."); audit("Wrong member credentials"); capture("dark-login-error-phone");
  await admin.rateLimit.deleteMany(); browser("fill", "#member-password", password); click("Sign in as member"); browser("wait", "--url", `${origin}/member`); text("My Gym QR"); text(`Private Member ${suffix}`); matrix("dashboard");
  assert.equal(evaluate("document.querySelectorAll('img[alt=\"Your personal attendance QR\"]').length"), 1);
  assert.equal(evaluate("fetch('/api/members/directory').then(response => response.status)"), 403, "Member cannot read CRM directory");
  for (const appearance of ["Light", "Dark"]) { theme(appearance); browser("set", "viewport", "320", "900"); audit(`${appearance} dashboard 320px`); capture(`${appearance.toLowerCase()}-dashboard-small-phone`); }
  // Native CLI downloads cancel even for an independent plain-file control on this host.
  // Verify the exact authenticated download response; native browser Save remains NOT VERIFIED.
  const downloaded = evaluate("(async()=>{const response=await fetch(document.querySelector('a[download=\"my-gym-qr.png\"]').href); const bytes=new Uint8Array(await response.arrayBuffer()); return {status:response.status,type:response.headers.get('content-type'),cache:response.headers.get('cache-control'),disposition:response.headers.get('content-disposition'),body:btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join(''))};})()");
  assert.equal(downloaded.status, 200); assert.equal(downloaded.type, "image/png"); assert.equal(downloaded.cache, "no-store");
  assert.equal(downloaded.disposition, 'attachment; filename="my-gym-qr.png"');
  const imagePath = resolve(tmpdir(), `member-qr-${suffix}.png`); writeFileSync(imagePath, Buffer.from(downloaded.body, "base64"));
  copyFileSync(imagePath, resolve(output, "downloaded-member-qr.png"));
  const require = createRequire(import.meta.url), png = createRequire(require.resolve("qrcode"))("pngjs").PNG.sync.read(readFileSync(imagePath)) as { width:number; height:number; data:Uint8Array };
  const pixels = Int32Array.from({ length: png.width * png.height }, (_, i) => (png.data[i*4]<<16)|(png.data[i*4+1]<<8)|png.data[i*4+2]);
  assert.equal(new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,png.width,png.height))), new Map([[DecodeHintType.PURE_BARCODE,true]])).getText(), qr.code);
  const oldImage = evaluate("document.querySelector('img[alt=\"Your personal attendance QR\"]').src");
  await memberQr(owner, member.id, { action: "replace", requestId: randomUUID() }); click("Refresh membership"); browser("wait", "--fn", `document.querySelector('img[alt="Your personal attendance QR"]')?.src !== ${JSON.stringify(oldImage)}`);
  assert.equal(await admin.payment.count({ where: { memberId: member.id } }), 1, "Viewing/downloading/replacing QR adds no payment");
  click("Sign out"); browser("wait", "--url", `${origin}/member/login`);
  open(`${origin}/member`); browser("wait", "--url", `${origin}/member/login`);
  click("Forgot your password?"); browser("fill", "#member-email", email); click("Request member recovery"); text("If a member account matches"); audit("Member recovery"); capture("dark-recovery-phone");
  await operatorLogin(); open(link.url); text("Save my profile"); separate();
  open(`${origin}/attendance`); text("New member QR"); assert.equal(evaluate("!!document.querySelector('.app-workspace')"), true);
  console.log("Member browser/HTTP PASS: signup password, immediate Pending dashboard/no QR, post-cash QR with the original password before email recovery, optional recovery, password errors, authenticated PNG decode, Light/Dark 1440/768/375/320, operator denial, replacement refresh and sign-out. Native browser Save remains NOT VERIFIED; no new native-save attempt in this run.");
} catch (error) { failure = error; try { capture("failure"); } catch {} }
finally { try { browser("close"); } catch {} await db.$disconnect(); await admin.$disconnect(); }
if (failure) throw failure;
