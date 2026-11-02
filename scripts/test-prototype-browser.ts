import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { assertSynthetic } from "../src/lib/email";
import { bootstrapSyntheticOwner, completeSetup, reauthenticate, inviteStaff, setCapabilities } from "../src/lib/identity";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { createMember } from "../src/lib/members";
import { changePlans } from "../src/lib/plans";
import { prepareCharge, confirmCash } from "../src/lib/charges";
import { legacyCommand } from "../src/lib/legacy";
assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic");
}
const origin = process.env.BETTER_AUTH_URL!;
assert.equal(origin, "http://127.0.0.1:3000");
const binary = resolve(".local/browser-tools/agent-browser-win32-x64.exe");
const session = `gym-prototype-${randomUUID().slice(0, 8)}`;
const output = resolve(".local/prototype-ui"); mkdirSync(output, { recursive: true });
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }) });
const suffix = randomUUID().slice(0, 8);
const email = `prototype-${suffix}@example.test`;
const password = "Synthetic prototype password 2026!";
let token = "";
const sender = { async send(message: { url: string }) { token = new URL(message.url).hash.slice(1); } };
function browser(...args: string[]) {
  const result = spawnSync(binary, ["--session", session, ...args], { encoding: "utf8", windowsHide: true, timeout: 45_000 });
  if (result.status !== 0) throw new Error(`Prototype browser step '${args[0]}' failed; output withheld to protect credentials.`);
  if (args[0] === "open") browser("wait", "--load", "load");
  return result.stdout;
}
function evaluate(code: string) { return JSON.parse(browser("eval", code, "--json")).data.result; }
function click(name: string) {
  if (name === "Sign out") browser("click", 'button[aria-label^="Account:"]');
  browser("find", "role", "button", "click", "--name", name, "--exact");
}
function appearance(value: string) { click("Appearance"); click(value[0].toUpperCase() + value.slice(1)); }
function memberFilter(value: string) { browser("find", "role", "radio", "click", "--name", value, "--exact"); }
function clearMemberSearch() {
  browser("focus", "#search-name"); browser("press", "Control+a"); browser("press", "Backspace");
  browser("wait", "--fn", "document.getElementById('search-name').value === '' && document.querySelectorAll('main td[data-label=Member]').length === 10");
}
function text(value: string) { browser("wait", "--text", value); }
function audit(label: string) {
  browser("wait", "--fn", "(() => { const ids = [...document.querySelectorAll('[id]')].map(node => node.id); return document.readyState === 'complete' && new Set(ids).size === ids.length; })()");
  assert.equal(evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `${label} overflow`);
  const result = JSON.parse(browser("a11y", "--tags", "wcag2a,wcag2aa", "--json")).data;
  const uncertainControls = result.incomplete?.filter((item: { id: string; nodes: { failureSummary: string }[] }) => item.id === "aria-valid-attr-value" && item.nodes.every(node => node.failureSummary.includes("Unable to determine if aria-controls referenced ID exists"))) ?? [];
  if (uncertainControls.length) {
    assert.equal(evaluate("Array.from(document.querySelectorAll('[aria-expanded=\"true\"][aria-controls]')).every(trigger=>{const target=document.getElementById(trigger.getAttribute('aria-controls'));return target && target.getAttribute('role')==='dialog' && target.getClientRects().length>0 && !target.closest('[aria-hidden=\"true\"],[inert]') && target.contains(document.activeElement);})"), true, `${label} open popup has a visible, accessible controlled dialog with focus inside`);
    result.counts.incomplete -= uncertainControls.length;
    console.log(`${label}: aria-controls DOM review PASS (visible accessible target and focus inside).`);
  }
  if (result.incomplete?.some((item: { id: string }) => item.id === "aria-hidden-focus") && evaluate("!!document.querySelector('[role=dialog]')")) {
    const stops = "Array.from(document.querySelector('[role=dialog]').querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex=\"0\"]')).filter(node=>node.getClientRects().length)";
    evaluate(`(${stops}).at(-1).focus(); true`); browser("press", "Tab");
    assert.equal(evaluate(`document.activeElement===(${stops})[0]`), true);
    browser("press", "Shift+Tab"); assert.equal(evaluate(`document.activeElement===(${stops}).at(-1)`), true);
    result.counts.incomplete -= result.incomplete.filter((item: { id: string }) => item.id === "aria-hidden-focus").length;
    console.log(`${label}: aria-hidden-focus manual review PASS (Tab/Shift+Tab wrap).`);
  }
  if (result.counts.violations || result.counts.incomplete) console.log(JSON.stringify({ label, violations: result.violations, incomplete: result.incomplete }));
  assert.equal(result.counts.violations, 0, `${label} violations`); assert.equal(result.counts.incomplete, 0, `${label} incomplete`);
}
let failure: unknown;
try {
  const gymId = randomUUID();
  await bootstrapSyntheticOwner({ gymId, gymName: "Synthetic Form & Function", name: "Alex Prototype", email }, sender, admin);
  await completeSetup(token, password);
  const response = await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ email, password }) }));
  assert.equal(response.status, 200);
  const owner = new Headers({ cookie: response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ") });
  await reauthenticate(owner, password);
  const plans = await changePlans(owner, { action: "initialize" });
  const monthly = plans.find(plan => plan.durationDays === 30)!;
  const fixture = [];
  for (const name of ["Maria Santos", "John Reyes", "Ana Cruz", "Carlo Lim", "Lea Mendoza", "Paolo Garcia"]) fixture.push(await createMember(owner, { fullName: name }));
  for (const member of [fixture[0], fixture[2], fixture[4]]) {
    const charge = await prepareCharge(owner, member.id, monthly.id);
    await confirmCash(owner, charge.id, "800.00", randomUUID());
  }
  const next = await prepareCharge(owner, fixture[2].id, monthly.id);
  await confirmCash(owner, next.id, "800.00", randomUUID());
  for (const [name, daysLeft] of [["Z Expiring Member", 3], ["Z Expired Member", -1]] as const) {
    const member = await createMember(owner, { fullName: name });
    const proposal = await legacyCommand(owner, { action: "prepare", memberId: member.id, previousId: null,
      sourceReference: `SYNTHETIC-${name.replaceAll(" ", "-")}-${suffix}`, sourceType: "GYM_REGISTER",
      corroboratingReference: `SYNTHETIC-CARD-${daysLeft}-${suffix}`, interpretation: "INSTANTS",
      claimedStart: new Date(Date.now() - 30 * 86_400_000).toISOString(), claimedEnd: new Date(Date.now() + daysLeft * 86_400_000).toISOString(),
      uncertainty: "CERTAIN", notes: "Synthetic Members UI fixture only." }, randomUUID());
    await legacyCommand(owner, { action: "review", proposalId: proposal.id, decision: "APPROVE", independentlyChecked: true, notes: "Synthetic fixture references checked." }, randomUUID());
  }
  await inviteStaff(owner, { name: "Prototype Staff", username: `prototype_${suffix}`, email: `prototype-staff-${suffix}@example.test` }, sender);
  await completeSetup(token, password);
  const staff = await admin.operator.findFirstOrThrow({ where: { gymId, role: "STAFF" } });
  await setCapabilities(owner, staff.id, { canManageMembers: true, canCollectCash: false });
  browser("open", `${origin}/login`); browser("fill", "#identifier", email); browser("fill", "#password", password); click("Sign in"); text("Welcome, Alex Prototype");
  browser("set", "viewport", "1440", "1000");
  browser("wait", "--fn", "!!document.querySelector('header time')?.getAttribute('datetime')");
  const clock = evaluate("document.querySelector('header time').textContent");
  browser("wait", "--fn", `document.querySelector('header time').textContent!==${JSON.stringify(clock)}`);
  assert.equal(evaluate("Math.abs(Date.now()-Date.parse(document.querySelector('header time').dateTime))<2500"), true);
  assert.equal(evaluate("document.querySelector('header time').textContent===new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true}).format(new Date(document.querySelector('header time').dateTime))"), true, "clock uses Manila time");
  assert.equal(evaluate("document.querySelector('[data-sidebar=footer]').textContent.includes('Alex Prototype')"), false);
  browser("focus", 'button[aria-label="Appearance"]'); browser("press", "Enter");
  audit("Appearance options"); browser("press", "Escape");
  assert.equal(evaluate("document.activeElement.getAttribute('aria-label')"), "Appearance");
  appearance("system"); browser("set", "media", "dark");
  browser("wait", "--fn", "document.documentElement.classList.contains('dark')");
  browser("reload"); browser("wait", "--fn", "!!document.querySelector('header time')?.getAttribute('datetime')");
  click("Appearance"); assert.equal(evaluate("document.querySelector('[role=group][aria-label=\"Color theme\"] button[aria-pressed=true]').textContent"), "System");
  browser("press", "Escape"); browser("set", "media", "light");
  browser("wait", "--fn", "!document.documentElement.classList.contains('dark')");
  evaluate("window.navbarSetItem=Storage.prototype.setItem; Storage.prototype.setItem=()=>{throw new DOMException('Storage unavailable','QuotaExceededError')}; true");
  appearance("dark"); browser("wait", "--fn", "document.documentElement.classList.contains('dark')");
  appearance("light"); browser("wait", "--fn", "!document.documentElement.classList.contains('dark')");
  evaluate("Storage.prototype.setItem=window.navbarSetItem; delete window.navbarSetItem; true");
  browser("reload"); browser("wait", "--fn", "!!document.querySelector('header time')?.getAttribute('datetime')");
  browser("focus", 'button[aria-label^="Account:"]'); browser("press", "Enter");
  audit("Owner account"); assert.equal(evaluate("document.querySelector('[role=dialog] a').getAttribute('href')"), "/team");
  browser("press", "Escape"); assert.equal(evaluate("document.activeElement.getAttribute('aria-label')"), "Account: Alex Prototype, Owner");
  for (const theme of ["light", "dark"]) {
    appearance(theme);
    for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1024], ["phone", 375, 812], ["narrow", 320, 812]] as const) {
      browser("set", "viewport", String(width), String(height)); audit(`${theme} navbar ${device}`);
      assert.equal(evaluate("(() => {const header=document.querySelector('header'), buttons=[...header.querySelectorAll('button')].filter(button=>button.getClientRects().length);return buttons.every(button=>{const box=button.getBoundingClientRect();return box.width>=44 && box.height>=44 && box.left>=0 && box.right<=innerWidth;})})()"), true, "Navbar buttons remain visible with 44px targets");
      browser("screenshot", resolve(output, `navbar-${theme}-${device}.png`));
    }
  }
  browser("set", "viewport", "1440", "1000");
  assert.deepEqual(evaluate("Array.from(document.querySelectorAll('nav[aria-label=\"Main navigation\"] [data-sidebar=group-label]')).map(item => item.textContent)"), ["Quick Actions", "Workspace", "Management"]);
  assert.deepEqual(evaluate("Array.from(document.querySelectorAll('nav[aria-label=\"Main navigation\"] a')).map(item => [item.textContent, item.getAttribute('href')])"), [
    ["Add Member", "/members#member-name"], ["Record Cash Payment", "/members#search-name"],
    ["Dashboard", "/"], ["Members", "/members"], ["Payments", "/transactions"],
    ["Plans & pricing", "/plans"], ["Team & access", "/team"], ["Historical pilot evidence", "/pilot"],
  ]);
  assert.equal(evaluate("document.querySelector('main').textContent.includes('3,200.00')"), true);
  for (let index = 0; index < 11; index++) {
    const member = await createMember(owner, { fullName: `Pagination member ${index}` });
    const charge = await prepareCharge(owner, member.id, monthly.id);
    await confirmCash(owner, charge.id, "800.00", randomUUID());
  }
  for (let index = 0; index < 15; index++) await createMember(owner, { fullName: `Table member ${index}` });
  const paths: string[][] = [["overview", "/"], ["members", "/members"], ["profile", `/members/${fixture[2].id}`], ["payment", `/members/${fixture[5].id}?charge=${(await prepareCharge(owner, fixture[5].id, monthly.id)).id}`], ["transactions", "/transactions"], ["team", "/team"], ["plans", "/plans"], ["pilot", "/pilot"], ["receipt", `/receipts/${(await admin.paymentReceipt.findFirstOrThrow({ where: { gymId } })).id}`]];
  for (const theme of ["light", "dark"]) {
    if (process.argv.includes("--skip-matrix")) break;
    appearance(theme);
    for (const [name, path] of paths.filter(([name]) => !process.argv.includes("--review-only") || ["members", "profile", "payment"].includes(name))) {
      browser("open", `${origin}${path}`); browser("wait", "--fn", "document.fonts.status === 'loaded'");
      browser("wait", "--fn", "!!document.querySelector('header time')?.getAttribute('datetime')");
      assert.equal(evaluate("document.documentElement.classList.contains('dark')"), theme === "dark");
      if (name === "profile") assert.equal(evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Renew membership')?.disabled && document.querySelector('#charge-plan').disabled"), true);
      if (name === "payment") browser("wait", "--fn", "document.activeElement?.id === 'charge-title'");
      for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1024], ["phone", 375, 812]] as const) {
        browser("set", "viewport", String(width), String(height)); audit(`${theme} ${name} ${device}`);
        if (["overview", "members", "profile", "transactions", "team", "plans", "pilot"].includes(name)) {
          if (device !== "desktop") { click("Toggle Sidebar"); browser("wait", '[role="dialog"]'); }
          const expected = name === "profile" ? "/members" : path;
          assert.deepEqual(evaluate("Array.from(document.querySelectorAll('nav[aria-label=\"Main navigation\"] a[aria-current=page]')).map(item => item.getAttribute('href'))"), [expected], `${theme} ${name} ${device} single active destination`);
          if (device !== "desktop") {
            audit(`${theme} ${name} ${device} drawer`);
            if (name === "overview") browser("screenshot", resolve(output, `${theme}-sidebar-${device}.png`));
            browser("press", "Escape"); browser("wait", "--fn", "!document.querySelector('[role=dialog]')");
            assert.equal(evaluate("document.activeElement.matches('[data-sidebar=trigger]')"), true, "Escape returns focus to trigger");
          }
        }
        if (device !== "desktop" && evaluate("window.scrollY") !== 0) console.log("Frame geometry", evaluate("(() => { const app=document.querySelector('.app-workspace'),main=document.getElementById('main'); return {width:innerWidth,height:innerHeight,rootY:scrollY,rootHeight:document.documentElement.scrollHeight,bodyHeight:document.body.scrollHeight,appHeight:app.getBoundingClientRect().height,mainHeight:main.getBoundingClientRect().height,mainScroll:main.scrollTop,mainOverflow:getComputedStyle(main).overflowY,appOverflow:getComputedStyle(app).overflow,visualHeight:visualViewport.height}; })()"));
        if (device !== "desktop") assert.equal(evaluate("window.scrollY"), 0, `${name} outer page scroll after resize`);
        evaluate(name === "payment" ? "(() => { const heading=document.getElementById('charge-title'),main=document.getElementById('main'); if(getComputedStyle(main).overflowY==='auto') main.scrollTop += heading.getBoundingClientRect().top-main.getBoundingClientRect().top-24; else heading.scrollIntoView({block:'start'}); return true; })()" : "window.scrollTo(0,0); true");
        if (device !== "desktop") assert.equal(evaluate("(() => { const nav=document.querySelector('nav[aria-label=\"Quick navigation\"]'),main=document.getElementById('main'); return Math.abs(nav.getBoundingClientRect().bottom-innerHeight)<1 && main.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top+1 && scrollY===0; })()"), true, `${name} navigation frame`);
        if (device !== "tablet") browser("screenshot", resolve(output, `${theme}-${name}-${device}-viewport.png`));
        browser("screenshot", resolve(output, `${theme}-${name}-${device}.png`), "--full");
        if (name === "members" && device !== "desktop") {
          evaluate("(() => {const main=document.getElementById('main');main.scrollTop+=document.getElementById('search-title').getBoundingClientRect().top-main.getBoundingClientRect().top-16;window.scrollTo(0,0);return true;})()");
          assert.equal(evaluate("scrollY"), 0, "Members row capture preserves the fixed navigation frame");
          audit(`${theme} members ${device} rows`);
          browser("screenshot", resolve(output, `${theme}-members-${device}-rows.png`));
          evaluate("document.getElementById('main').scrollTop=0; true");
        }
        if (name === "transactions") {
          evaluate(`document.getElementById('main').scrollTop=${device === "phone" ? 800 : 500}; true`);
          audit(`${theme} transactions ${device} rows`);
          browser("screenshot", resolve(output, `${theme}-transactions-${device}-rows.png`));
          evaluate("document.getElementById('main').scrollTop=document.getElementById('main').scrollHeight; true");
          audit(`${theme} transactions ${device} pagination`);
          assert.equal(evaluate("(() => {const nav=document.querySelector('nav[aria-label=\"Payment pages\"]'),main=document.getElementById('main');return nav.getBoundingClientRect().top>=main.getBoundingClientRect().top && nav.getBoundingClientRect().bottom<=main.getBoundingClientRect().bottom;})()"), true, "pagination stays within the scrolling workspace");
          browser("screenshot", resolve(output, `${theme}-transactions-${device}-pagination.png`));
          evaluate("document.getElementById('main').scrollTop=0; true");
        }
      }
      console.log(`${theme} ${name}: desktop/tablet/phone, overflow, axe PASS`);
    }
  }
  appearance("dark");
  browser("set", "viewport", "375", "812"); browser("open", `${origin}/operate`);
  text("Find a member"); assert.equal(evaluate("location.pathname"), "/members", "Owner compatibility redirect");
  click("Toggle Sidebar"); browser("wait", '[role="dialog"]');
  browser("click", 'nav[aria-label="Main navigation"] a[href="/members#member-name"]');
  browser("wait", "#member-name"); browser("wait", "--fn", "!document.querySelector('[role=dialog]')");
  assert.equal(evaluate("location.pathname + location.hash"), "/members#member-name");
  assert.equal(evaluate("(() => {const box=document.getElementById('member-name').getBoundingClientRect(), main=document.getElementById('main').getBoundingClientRect();return box.top>=main.top && box.bottom<=main.bottom && scrollY===0;})()"), true, "Add Member targets visible form");
  click("Create member"); text("Check the member fields below.");
  const newName = `Sidebar member ${suffix}`;
  browser("fill", "#member-name", newName); click("Create member"); text("Member created. Review the member record before collecting payment.");
  const created = await admin.member.findFirstOrThrow({ where: { gymId, fullName: newName } });
  assert.equal(await admin.payment.count({ where: { memberId: created.id } }), 0, "Creation alone records no payment");
  click("Toggle Sidebar"); browser("wait", '[role="dialog"]');
  browser("find", "role", "link", "click", "--name", "Record Cash Payment", "--exact");
  browser("wait", "--fn", "location.hash === '#search-name' && !document.querySelector('[role=dialog]')");
  assert.equal(evaluate("location.pathname"), "/members");
  assert.equal(evaluate("(() => {const box=document.getElementById('search-name').getBoundingClientRect(),main=document.getElementById('main').getBoundingClientRect();return box.top>=main.top && box.bottom<=main.bottom && scrollY===0;})()"), true, "Cash shortcut targets visible lookup");
  browser("fill", "#search-name", newName); click("Refresh members"); text(newName);
  browser("click", `main a[href="/members/${created.id}"]`); text("Member profile"); text(newName);
  assert.equal(evaluate("document.querySelector('main').innerText.includes('Not eligible')"), true);
  click("Prepare charge preview"); text("Saved charge preview"); browser("fill", "#cash-received", "800.00");
  click("Review cash payment"); text("Confirm only after receiving the full cash amount.");
  assert.equal(await admin.payment.count({ where: { memberId: created.id } }), 0, "Review creates no payment");
  click("Confirm full cash"); text("Full cash payment confirmed");
  assert.equal(await admin.payment.count({ where: { memberId: created.id } }), 1);
  assert.equal(await admin.paymentReceipt.count({ where: { payment: { memberId: created.id } } }), 1);
  console.log("Add Member and Record Cash Payment shortcuts: validation, no access/payment from creation, full cash and durable receipt PASS.");
  for (const path of ["/digital", "/investigations", "/investigations/retired", "/outage-receipts", "/closing"]) {
    browser("open", `${origin}${path}`);
    assert.equal(evaluate("document.body.innerText.includes('404') || document.body.innerText.includes('This page could not be found')"), true, `${path} is retired`);
  }
  browser("set", "viewport", "1440", "1000"); browser("open", `${origin}${paths.find(([name]) => name === "payment")![1]}`);
  text("Saved charge preview");
  assert.equal(await admin.payment.count({ where: { memberId: fixture[5].id } }), 0);
  click("Review cash payment"); text("Confirm only after receiving the full cash amount.");
  assert.equal(await admin.payment.count({ where: { memberId: fixture[5].id } }), 0, "Review never records a collection");
  audit("Cash review before confirmation"); browser("screenshot", resolve(output, "dark-cash-review-desktop.png"));
  click("Back to payment");
  assert.equal(evaluate("document.querySelector('main').innerText.includes('GCash') || document.querySelector('main').innerText.includes('Bank transfer')"), false, "payment preview offers cash only");
  browser("set", "viewport", "375", "812"); browser("open", `${origin}/transactions`); text("Payments");
  browser("wait", "--fn", "document.querySelectorAll('main #payment-page-size').length===1 && document.querySelector('main section[aria-label=\"Payment history\"]').getAttribute('aria-busy')==='false'");
  assert.deepEqual(evaluate("Array.from(document.querySelectorAll('main th')).map(node=>node.textContent)"), ["Member", "Method", "Amount", "Status", "Receipt"]);
  const summaryBefore = evaluate("document.querySelector('[aria-label=\"Payment summary\"]').innerText");
  const paginationCount = await admin.payment.count({ where: { gymId } });
  const lastPage = Math.ceil(paginationCount / 10);
  const lastPageCount = paginationCount - (lastPage - 1) * 10;
  assert.deepEqual(evaluate("Array.from(document.querySelectorAll('main #payment-page-size option')).map(option=>option.value)"), ["10", "20", "30"]);
  assert.equal(evaluate("document.querySelectorAll('main td[data-label=Member]').length"), 10);
  for (const [action, page, count] of [["Next page", "2", Math.min(10, paginationCount - 10)], ["First page", "1", 10], ["Last page", String(lastPage), lastPageCount], ["Previous page", String(lastPage - 1), 10]] as const) {
    click(action);
    browser("wait", "--fn", `new URL(location.href).searchParams.get('page')==='${page}' && document.querySelectorAll('main td[data-label=Member]').length===${count} && document.querySelector('section[aria-label="Payment history"]').getAttribute('aria-busy')==='false'`);
    assert.equal(evaluate("document.querySelector('[aria-label=\"Payment summary\"]').innerText"), summaryBefore);
    assert.equal(evaluate("document.activeElement.getAttribute('aria-label')"), action, "page navigation preserves control focus");
  }
  for (const size of ["20", "30", "10"]) {
    browser("focus", "main #payment-page-size");
    browser("select", "main #payment-page-size", size);
    browser("wait", "--fn", `new URL(location.href).searchParams.get('pageSize')==='${size}' && document.querySelectorAll('main td[data-label=Member]').length===${Math.min(Number(size), paginationCount)}`);
    assert.equal(evaluate("new URL(location.href).searchParams.get('page')"), "1");
    assert.equal(evaluate("document.activeElement.id"), "payment-page-size");
  }
  click("Last page"); browser("wait", "--fn", `new URL(location.href).searchParams.get('page')==='${lastPage}' && document.querySelectorAll('main td[data-label=Member]').length===${lastPageCount}`);
  click("Bank transfer"); text("No matching payments");
  assert.equal(evaluate("new URL(location.href).searchParams.get('page')"), "1", "filters reset page");
  assert.equal(evaluate("document.querySelector('[aria-label=\"Payment summary\"]').innerText"), summaryBefore);
  browser("find", "role", "radio", "click", "--name", "Pending", "--exact"); text("No pending payments in this history"); audit("Pending history empty state");
  browser("screenshot", resolve(output, "dark-transactions-pending-phone.png"));
  assert.equal(evaluate("document.querySelectorAll('main td[data-label=Receipt]').length"), 0);
  assert.equal(evaluate("Array.from(document.querySelectorAll('nav[aria-label=\"Payment pages\"] button')).every(button=>button.getAttribute('aria-disabled')==='true')"), true);
  click("Reset filters"); browser("wait", "--fn", "!new URL(location.href).searchParams.has('method') && !new URL(location.href).searchParams.has('status') && document.querySelector('section[aria-label=\"Payment history\"]').getAttribute('aria-busy')==='false'");
  browser("fill", "input[name=member]", "Maria Santos"); click("Search"); text("Maria Santos");
  browser("wait", "--fn", "new URL(location.href).searchParams.get('member')==='Maria Santos' && document.querySelectorAll('main td[data-label=Member]').length===1");
  assert.equal(evaluate("document.activeElement.textContent"), "Search", "Server filters preserve keyboard focus");
  browser("click", "main td[data-label=Member] button"); text("Payment details"); audit("Payment details Sheet");
  browser("focus", '[role="dialog"] button[aria-label="Close payment details"]');
  browser("screenshot", resolve(output, "dark-transactions-details-phone.png"));
  assert.equal(evaluate(`document.querySelector('[role=dialog] a[href="/members/${fixture[0].id}"]')!==null`), true);
  browser("press", "Escape"); browser("wait", "--fn", "!document.querySelector('[role=dialog]')");
  assert.equal(evaluate("document.activeElement.closest('td')?.getAttribute('data-label')"), "Member");
  click("All dates"); click("Today"); browser("focus", "#payment-date-from");
  browser("press", "ArrowRight"); browser("press", "ArrowRight"); browser("press", "ArrowUp"); browser("press", "Tab");
  assert.equal(evaluate("document.getElementById('payment-date-from').value > document.getElementById('payment-date-to').value"), true, "keyboard edits the native start date after the end date");
  click("Apply date range"); text("End date must be on or after start date."); audit("Payment range validation");
  browser("screenshot", resolve(output, "dark-transactions-range-error-phone.png"));
  browser("press", "Escape"); browser("wait", "--fn", "!document.querySelector('[role=dialog]')");
  assert.equal(evaluate("document.activeElement.textContent"), "All dates", "Date picker Escape returns focus to its trigger");
  click("More filters"); browser("fill", "#payment-reference", "Missing reference"); click("Apply filters"); text("No matching payments");
  browser("back"); browser("wait", "--fn", "!new URL(location.href).searchParams.has('reference') && document.querySelectorAll('main td[data-label=Member]').length===1");
  assert.equal(evaluate("document.getElementById('transaction-search').value"), "Maria Santos", "Back restores URL filters");
  assert.equal(evaluate("document.querySelector('main').innerText.includes('Pending verification')"), false);
  browser("fill", "#transaction-search", "No matching transaction"); click("Search"); text("No matching payments"); audit("Empty transaction filter");
  browser("set", "viewport", "1440", "1000"); browser("open", `${origin}/members`); text("Find a member");
  const memberCounts = evaluate("document.querySelector('[aria-label=\"Member summary\"]').textContent");
  memberFilter("Expiring soon"); text("Z Expiring Member");
  assert.equal(evaluate("document.querySelectorAll('main td[data-label=Member]').length"), 1);
  browser("screenshot", resolve(output, "dark-members-expiring.png"));
  memberFilter("Active"); assert.equal(evaluate("Array.from(document.querySelectorAll('main td[data-label=Member]')).some(node=>node.textContent.includes('Z Expired Member'))"), false);
  memberFilter("All members");
  assert.equal(evaluate("document.querySelectorAll('main tbody tr').length"), 10);
  assert.deepEqual(evaluate("Array.from(document.querySelectorAll('main th')).map(node=>node.textContent)"), ["Member", "Email", "Phone #", "Membership started", "Membership expires", "Actions"]);
  const memberCount = await admin.member.count({ where: { gymId } });
  const memberLastPage = Math.ceil(memberCount / 10);
  assert.deepEqual(evaluate("Array.from(document.querySelectorAll('#member-page-size option')).map(option=>option.value)"), ["10", "20", "30"]);
  for (const [action, page] of [["Next page", 2], ["Last page", memberLastPage], ["Previous page", memberLastPage - 1], ["First page", 1]] as const) {
    click(action);
    browser("wait", "--fn", `document.querySelector('nav[aria-label="Member pages"]').textContent.includes('Page ${page} of ${memberLastPage}')`);
    assert.equal(evaluate("document.querySelector('nav[aria-label=\"Member pages\"]').previousElementSibling.textContent.includes(" + JSON.stringify(`Showing ${(page - 1) * 10 + 1}–${Math.min(page * 10, memberCount)} of ${memberCount} members.`) + ")"), true);
    assert.equal(evaluate("document.querySelector('[aria-label=\"Member summary\"]').textContent"), memberCounts);
  }
  for (const size of [20, 30, 10]) {
    click("Last page"); browser("select", "#member-page-size", String(size));
    browser("wait", "--fn", `document.querySelectorAll('main td[data-label=Member]').length===${Math.min(size, memberCount)} && document.querySelector('nav[aria-label="Member pages"]').textContent.includes('Page 1 of ${Math.ceil(memberCount / size)}')`);
    if (size === 20) {
      click("Last page"); memberFilter("Pending");
      assert.equal(evaluate("document.getElementById('member-page-size').value"), "20");
      assert.equal(evaluate("document.querySelector('nav[aria-label=\"Member pages\"]').textContent.includes('Page 1 of')"), true);
      memberFilter("All members");
    }
  }
  click("Next page");
  browser("fill", "#search-name", "Nobody with this name"); text("No members match this filter."); audit("Empty member search");
  assert.equal(evaluate("document.querySelector('nav[aria-label=\"Member pages\"]').textContent.includes('Page 1 of 1')"), true);
  assert.equal(evaluate("Array.from(document.querySelectorAll('nav[aria-label=\"Member pages\"] button')).every(button=>button.getAttribute('aria-disabled')==='true')"), true);
  assert.equal(evaluate("document.querySelector('[aria-label=\"Member summary\"]').textContent"), memberCounts);
  browser("fill", "#search-name", "Ana Cruz"); click("Refresh members"); text("Paid next term scheduled"); memberFilter("Pending"); text("No members match this filter.");
  memberFilter("All members"); clearMemberSearch();
  browser("click", "main th:first-child button"); assert.equal(evaluate("document.querySelector('main th').getAttribute('aria-sort')"), "descending");
  assert.equal(evaluate("document.querySelector('main td a').textContent"), "Z Expiring Member");
  browser("click", "main th:first-child button"); assert.equal(evaluate("document.querySelector('main td a').textContent"), "Ana Cruz");
  browser("click", "main th:nth-child(2) button"); assert.equal(evaluate("document.querySelector('main th:nth-child(2)').getAttribute('aria-sort')"), "ascending");
  browser("click", "main th:first-child button");
  browser("focus", 'button[aria-label="Actions for Ana Cruz"]'); browser("press", "Enter"); browser("wait", '[role="menu"]');
  browser("screenshot", resolve(output, "dark-members-actions.png"));
  assert.equal(evaluate(`document.querySelector('[role=menuitem]:first-child').getAttribute('href')`), `/members/${fixture[2].id}`);
  assert.equal(evaluate(`document.querySelector('[role=menuitem]:last-child').getAttribute('href')`), `/members/${fixture[2].id}#member-payments`);
  browser("press", "Escape"); assert.equal(evaluate("document.activeElement.getAttribute('aria-label')"), "Actions for Ana Cruz");
  browser("fill", "#search-name", "Carlo Lim"); memberFilter("Pending"); text("Carlo Lim");
  assert.equal(evaluate("document.querySelectorAll('main tbody tr').length"), 1);
  memberFilter("Active"); text("No members match this filter.");
  memberFilter("All members"); clearMemberSearch();
  browser("network", "route", "**/api/members/directory", "--abort"); click("Refresh members");
  browser("wait", '[role="alert"]'); assert.equal(evaluate("document.activeElement.id"), "member-feedback");
  text("Unable to refresh members. Showing the last loaded records. Try Refresh again.");
  browser("screenshot", resolve(output, "dark-members-refresh-error.png"));
  assert.equal(evaluate("document.querySelector('[aria-label=\"Member summary\"]').textContent"), memberCounts);
  browser("network", "unroute"); click("Refresh members"); text("Member list refreshed.");
  for (const theme of ["light", "dark"]) {
    appearance(theme);
    for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1024], ["phone", 375, 812]] as const) {
      browser("set", "viewport", String(width), String(height));
      evaluate("(() => {const nav=document.querySelector('nav[aria-label=\"Member pages\"]'),main=document.getElementById('main');if(innerWidth<1024){window.scrollTo(0,0);main.scrollTop+=nav.getBoundingClientRect().top-main.getBoundingClientRect().top-100;}else nav.scrollIntoView({block:'center'});return true;})()");
      browser("wait", "--fn", "document.getAnimations().every(animation=>animation.playState!=='running')");
      audit(`${theme} member pagination ${device}`);
      assert.equal(evaluate("(() => {const nav=document.querySelector('nav[aria-label=\"Member pages\"]'),main=document.getElementById('main'),box=nav.getBoundingClientRect();return box.top>=Math.max(0,main.getBoundingClientRect().top)&&box.bottom<=Math.min(innerHeight,main.getBoundingClientRect().bottom)&&[...nav.querySelectorAll('button,select')].every(control=>{const b=control.getBoundingClientRect();return b.width>=44&&b.height>=44;});})()"), true, "Member pagination is visible with 44px targets");
      browser("screenshot", resolve(output, `${theme}-members-${device}-pagination.png`));
    }
  }
  browser("set", "viewport", "375", "812"); browser("open", `${origin}/operate`);
  browser("wait", "--url", `${origin}/members`); browser("wait", "--load", "load");
  // Require one completed destination form before opening and auditing the mobile drawer.
  browser("wait", "--fn", "document.querySelectorAll('#search-name').length === 1 && document.querySelectorAll('#member-name').length === 1");
  browser("focus", '[data-sidebar="trigger"]'); browser("press", "Enter");
  browser("wait", '[role="dialog"]'); audit("Mobile keyboard navigation");
  browser("press", "Escape"); browser("wait", "--fn", "!document.querySelector('[role=dialog]')");
  browser("set", "viewport", "320", "812"); audit("320px Members reflow");
  browser("set", "viewport", "375", "812"); browser("open", `${origin}/members/${fixture[0].id}`);
  browser("select", "#legacy-action", "review"); browser("check", "#legacy-independentlyChecked");
  assert.equal(evaluate("document.getElementById('legacy-independentlyChecked').checked"), true);
  assert.equal(evaluate("(() => { const box=document.getElementById('legacy-independentlyChecked').getBoundingClientRect(),nav=document.querySelector('nav[aria-label=\"Quick navigation\"]').getBoundingClientRect(); return box.top>=0 && box.bottom<=nav.top && scrollY===0; })()"), true, "Mobile historical review checkbox stays above navigation");
  audit("Mobile historical review checkbox"); browser("screenshot", resolve(output, "dark-legacy-checkbox-phone.png"));
  browser("click", 'button[aria-label^="Account:"]');
  browser("network", "route", "**/api/auth/sign-out", "--abort");
  browser("find", "role", "button", "click", "--name", "Sign out", "--exact"); text("Unable to sign out. Try again.");
  assert.equal(evaluate("document.querySelector('[role=dialog] button').disabled"), false, "Failed sign-out remains retryable in account popover");
  browser("network", "unroute"); browser("press", "Escape");
  click("Sign out"); text("You are signed out.");
  browser("open", `${origin}/operate`); browser("wait", "#identifier");
  assert.equal(evaluate("location.pathname"), "/login", "Signed-out compatibility redirect grants no access");
  browser("find", "role", "radio", "click", "--name", "Staff", "--exact"); browser("fill", "#identifier", `prototype_${suffix}`); browser("fill", "#password", password); click("Sign in"); text("Find a member");
  assert.equal(evaluate("document.querySelector('header button[aria-label^=\"Account:\"]').getAttribute('aria-label')"), "Account: Prototype Staff, Staff");
  browser("click", 'button[aria-label^="Account:"]'); audit("Staff account");
  assert.equal(evaluate("document.querySelector('[role=dialog] a').textContent"), "Your account");
  browser("screenshot", resolve(output, "navbar-staff-phone.png")); browser("press", "Escape");
  assert.equal(new URL(evaluate("location.href")).pathname, "/members");
  for (const path of ["/", "/plans", "/operate"]) {
    browser("open", `${origin}${path}`); text("Find a member");
    assert.equal(evaluate("location.pathname"), "/members", `${path} resolves to authorized Members workspace for staff`);
  }
  click("Toggle Sidebar"); browser("wait", '[role="dialog"]');
  assert.deepEqual(evaluate("Array.from(document.querySelectorAll('nav[aria-label=\"Main navigation\"] a')).map(item => item.textContent)"), ["Add Member", "Members", "Payments", "Your account", "Historical pilot evidence"]);
  assert.equal(evaluate("document.querySelector('[data-sidebar=header] a').getAttribute('href')"), "/members", "Staff brand uses Members home");
  browser("press", "Escape"); browser("wait", "--fn", "!document.querySelector('[role=dialog]')");
  browser("open", `${origin}/members/${fixture[0].id}`); text("Preparing a charge requires member access and cash collection permission"); audit("Staff member profile permission state");
  assert.equal(evaluate(`fetch('/api/charges', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({memberId:'${fixture[0].id}',planId:'${monthly.id}'})}).then(response=>response.status)`), 403);
  await reauthenticate(owner, password);
  await setCapabilities(owner, staff.id, { canManageMembers: true, canCollectCash: true });
  browser("reload"); text("Prepare charge preview"); click("Toggle Sidebar"); browser("wait", '[role="dialog"]');
  assert.equal(evaluate("!!document.querySelector('nav[aria-label=\"Main navigation\"] a[href=\"/members#search-name\"]')"), true);
  browser("press", "Escape"); browser("wait", "--fn", "!document.querySelector('[role=dialog]')");
  await setCapabilities(owner, staff.id, { canManageMembers: false, canCollectCash: true });
  browser("open", `${origin}/team`); text("Your account"); click("Toggle Sidebar"); browser("wait", '[role="dialog"]');
  assert.deepEqual(evaluate("Array.from(document.querySelectorAll('nav[aria-label=\"Main navigation\"] a')).map(item => item.textContent)"), ["Your account"], "cash-only staff cannot use member-based shortcuts");
  browser("press", "Escape"); browser("wait", "--fn", "!document.querySelector('[role=dialog]')");
  await setCapabilities(owner, staff.id, { canManageMembers: false, canCollectCash: false });
  for (const path of ["/", "/operate", "/members", "/transactions", "/team"]) {
    browser("open", `${origin}${path}`); text("Your account");
    assert.equal(evaluate("document.querySelector('main').textContent.includes('Maria Santos')"), false);
  }
  assert.equal(evaluate("fetch('/api/members').then(response => response.status)"), 403);
  assert.equal(evaluate("fetch('/api/members/directory').then(response => response.status)"), 403);
  click("Toggle Sidebar"); browser("wait", '[role="dialog"]');
  assert.deepEqual(evaluate("Array.from(document.querySelectorAll('nav[aria-label=\"Main navigation\"] [data-sidebar=group-label]')).map(item => item.textContent)"), ["Management"], "empty action/workspace groups hidden");
  assert.deepEqual(evaluate("Array.from(document.querySelectorAll('nav[aria-label=\"Main navigation\"] a')).map(item => item.textContent)"), ["Your account"]);
  console.log("Transaction/member filters, empty states, keyboard, 320px reflow, staff landing, denied cash preparation and immediate capability revocation PASS.");
} catch (error) { try { browser("screenshot", resolve(output, "failure.png"), "--full"); } catch {} failure = error; }
finally {
  try { browser("close"); } catch (error) { failure ??= error; }
  await admin.$disconnect(); await db.$disconnect();
}
if (failure) throw failure;
