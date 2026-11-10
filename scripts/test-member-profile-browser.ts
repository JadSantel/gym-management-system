import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { assertSynthetic } from "../src/lib/email";
import { bootstrapSyntheticOwner, completeSetup, reauthenticate } from "../src/lib/identity";
import { changePlans } from "../src/lib/plans";
import { createMember } from "../src/lib/members";
import { prepareCharge, confirmCash } from "../src/lib/charges";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
assertSynthetic();
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/gym_crm_synthetic");
}
const origin="http://127.0.0.1:3000", suffix=randomUUID().slice(0,8), session=`profile-${suffix}`;
assert.equal(process.env.BETTER_AUTH_URL, origin);
const output=resolve(".impeccable/review/member-profile"); mkdirSync(output,{recursive:true});
const admin=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.MIGRATION_DATABASE_URL})});
const password="Synthetic profile password 2026!", email=`profile-${suffix}@example.test`;
function browser(...args:string[]) { const r=spawnSync(resolve(".local/browser-tools/agent-browser-win32-x64.exe"),["--session",session,...args],{encoding:"utf8",windowsHide:true,timeout:45000}); if(r.status!==0)throw new Error(`Browser ${args[0]} failed: ${r.stderr}`); if(args[0]==="open"){browser("wait","--load","load");if(/\/members\/[0-9a-f-]{36}/i.test(args[1]))browser("wait","--text","Member profile");} if(args[0]==="screenshot" && args[1]) { const file=r.stdout.match(/Screenshot saved to (.+)/)?.[1]?.trim(); if(file && file!==args[1])copyFileSync(file,args[1]); } return r.stdout; }
const evaluate=(code:string)=>JSON.parse(browser("eval",code,"--json")).data.result;
const click=(name:string)=>browser("find","role","button","click","--name",name,"--exact");
const text=(s:string)=>browser("wait","--text",s);
const wait=(s:string)=>browser("wait","--fn",s);
function theme(name:string) { click("Appearance"); click(name); wait("document.getAnimations().every(a=>a.playState!=='running')"); }
function capture(name:string, section?:string) { evaluate("(async()=>{const dialog=document.querySelector('[role=dialog],[role=alertdialog]');if(dialog)dialog.scrollTop=0;document.getElementById('main')?.scrollTo(0,0);await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));return true})()"); if(section)browser("scrollintoview",section); browser("screenshot",resolve(output,`${name}.png`)); }
function audit(label:string) {
  assert.equal(evaluate("document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].every(d=>{const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&d.scrollWidth<=d.clientWidth})"),true,`${label} bounds`);
  const modal=evaluate("!!document.querySelector('[role=dialog],[role=alertdialog]')");
  const args=modal?["--selector","[role=dialog],[role=alertdialog]"]:[];
  const result=JSON.parse(browser("a11y",...args,"--tags","wcag2a,wcag2aa","--json")).data;
  type Finding={id:string;nodes:{target:string[];failureSummary:string}[]};
  const findings:Finding[]=[...(result.violations??[]),...(result.incomplete??[])];
  const contrast=findings.filter(item=>item.id==="color-contrast" && item.nodes.every(n=>n.target.length===1 && n.failureSummary.includes("partially overlaps")));
  if(contrast.length){
    const selectors=contrast.flatMap(item=>item.nodes.map(n=>n.target[0]));
    const checked=evaluate(`(() => {
      const root=document.querySelector('[role=dialog],[role=alertdialog]')||document;
      const ctx=document.createElement('canvas').getContext('2d');
      const pixel=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return ctx.getImageData(0,0,1,1).data};
      const luminance=rgba=>{const c=Array.from(rgba).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return c[0]*.2126+c[1]*.7152+c[2]*.0722};
      return ${JSON.stringify(selectors)}.map(selector=>{
        const node=root.querySelector(selector);if(!node)return {selector,visible:false};node.scrollIntoView({block:'center'});
        const chain=[node];let surface=node;while(surface.parentElement&&pixel(getComputedStyle(surface).backgroundColor)[3]!==255){surface=surface.parentElement;chain.push(surface)}
        ctx.clearRect(0,0,1,1);for(const n of chain.reverse()){ctx.fillStyle=getComputedStyle(n).backgroundColor;ctx.fillRect(0,0,1,1)}const bg=ctx.getImageData(0,0,1,1).data,fg=pixel(getComputedStyle(node).color),a=luminance(bg),b=luminance(fg),range=document.createRange();range.selectNodeContents(node);
        return {selector,opaque:bg[3]===255&&fg[3]===255,ratio:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05),visible:[...range.getClientRects()].every(r=>node.contains(document.elementFromPoint(r.left+2,r.top+r.height/2)))};
      });
    })()`);
    assert.ok(checked.every((n:{opaque:boolean;visible:boolean;ratio:number})=>n.opaque&&n.visible&&n.ratio>=4.5),`${label} measured contrast: ${JSON.stringify(checked)}`);
    console.log(`${label}: ${checked.length} overlap findings resolved by measured contrast and visible text.`);
  }
  const remaining=findings.filter(item=>!contrast.includes(item));
  assert.deepEqual(remaining,[],`${label} unresolved axe findings`);
}
function focusTrap(role="dialog") {
  const stops=`[...document.querySelector('[role=${role}]').querySelectorAll('button:not([disabled]),input:not([disabled]):not([type=radio]),input[type=radio]:checked,select:not([disabled]),a[href]')].filter(n=>n.getClientRects().length)`;
  evaluate(`(${stops}).at(-1).focus();true`);browser("press","Tab");assert.equal(evaluate(`document.activeElement===(${stops})[0]`),true,"Tab wraps inside dialog");
  browser("press","Shift+Tab");assert.equal(evaluate(`document.activeElement===(${stops}).at(-1)`),true,"Shift+Tab wraps inside dialog");
}

try {
  await admin.rateLimit.deleteMany();
  const gymId=randomUUID();let setup="";
  await bootstrapSyntheticOwner({gymId,gymName:"Synthetic Profile Gym",name:"Profile Owner",email},{async send(m){setup=new URL(m.url).hash.slice(1)}},admin);
  await completeSetup(setup,password);
  const login=await auth.handler(new Request(`${origin}/api/auth/sign-in/email`,{method:"POST",headers:{"content-type":"application/json",origin},body:JSON.stringify({email,password})})); assert.equal(login.status,200);
  const owner=new Headers({cookie:login.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ")});
  await reauthenticate(owner,password);await changePlans(owner,{action:"initialize"});
  const member=await createMember(owner,{fullName:`Alex Profile ${suffix}`,phone:"09171234123",email:`alex-${suffix}@example.test`});
  const plan=await admin.plan.findFirstOrThrow({where:{gymId,durationDays:30}});
  const charge=await prepareCharge(owner,member.id,plan.id);await confirmCash(owner,charge.id,"800.00",randomUUID());
  browser("open",`${origin}/login`);browser("fill","#identifier",email);browser("fill","#password",password);click("Sign in");browser("wait","--url",`${origin}/`);text("Welcome, Profile Owner");
  browser("open",`${origin}/members/${member.id}`);text("Member profile");
  assert.equal(evaluate("!document.querySelector('#member-evidence,#front-desk-actions') && !!document.querySelector('[aria-labelledby=billing-title] #member-overview') && !!document.querySelector('[aria-labelledby=billing-title] #member-payments')"),true);
  assert.deepEqual(evaluate("[...document.querySelectorAll('#member-payments th')].map(n=>n.textContent)"),["Entry recorded","Amount","Receipt","Status"]);
  assert.equal(evaluate("document.querySelector('[role=progressbar]').getAttribute('aria-valuenow')>=0"),true);
  const operator=await admin.operator.findFirstOrThrow({where:{gymId,role:"OWNER"}});
  for(const [label,startOffset,endOffset] of [["Expired",-31,-1]] as const){
    const historical=await createMember(owner,{fullName:`${label} Profile ${suffix}`});
    const startsAt=new Date(Date.now()+startOffset*86400000),endsAt=new Date(Date.now()+endOffset*86400000);
    await admin.$transaction(async tx=>{
      const proposal=await tx.legacyRecord.create({data:{gymId,memberId:historical.id,kind:"PREPARE",sourceReference:`SYNTHETIC-${label}-${suffix}`,sourceType:"GYM_REGISTER",corroboratingReference:`SYNTHETIC-card-${label}-${suffix}`,interpretation:"INSTANTS",claimedStart:startsAt.toISOString(),claimedEnd:endsAt.toISOString(),startsAt,endsAt,uncertainty:"CERTAIN",notes:"Synthetic retained read-only history fixture.",actorId:operator.id,operationKey:randomUUID(),fingerprint:"a".repeat(64)}});
      const approval=await tx.legacyRecord.create({data:{...proposal,id:randomUUID(),kind:"APPROVE",proposalId:proposal.id,operationKey:randomUUID(),fingerprint:"b".repeat(64),createdAt:new Date()}});
      await tx.effectiveEntitlement.create({data:{gymId,memberId:historical.id,legacyRecordId:approval.id,startsAt,endsAt}});
    });
    browser("open",`${origin}/members/${historical.id}`);text("Expired");
    assert.equal(evaluate("document.querySelector('[role=progressbar]').getAttribute('aria-valuenow')"),"100");
    assert.equal(evaluate("document.querySelector('#member-overview').innerText.includes('Remaining:')"),false);
    audit(label);capture(`${label.toLowerCase()}-profile`);
  }
  browser("open",`${origin}/members/${member.id}`);
  for(const appearance of process.argv.includes("--skip-matrix")?[]:["Light","Dark"]){
    theme(appearance);browser("reload");text("Billing");assert.equal(evaluate("document.documentElement.classList.contains('dark')"),appearance==="Dark");
    for(const [device,width,height] of [["desktop",1440,1000],["tablet",768,1000],["phone",375,900],["narrow",320,900]] as const){
      browser("set","viewport",String(width),String(height));audit(`${appearance} ${device} profile`);capture(`${appearance.toLowerCase()}-${device}`);capture(`${appearance.toLowerCase()}-${device}-billing`,"#billing-title");capture(`${appearance.toLowerCase()}-${device}-qr`,"#personal-qr-title");
      click("Record payment");text("Choose a membership");wait("document.activeElement.id==='charge-title'");audit(`${appearance} ${device} payment`);capture(`${appearance.toLowerCase()}-${device}-payment`);
      focusTrap();browser("press","Escape");wait("!document.querySelector('[role=dialog]')");assert.equal(evaluate("document.activeElement.textContent==='Record payment'"),true);
      browser("scrollintoview","#personal-qr-title");click("Replace personal QR");text("Replace personal QR?");assert.equal(evaluate("document.activeElement.textContent==='Cancel'"),true);audit(`${appearance} ${device} replace`);capture(`${appearance.toLowerCase()}-${device}-replace`);
      focusTrap("alertdialog");click("Cancel");wait("!document.querySelector('[role=alertdialog]')");assert.equal(evaluate("document.activeElement.textContent==='Replace personal QR'"),true);
    }
  }
  browser("set","viewport","1440","1000");
  const oldQr=await admin.memberQr.findFirstOrThrow({where:{memberId:member.id,revokedAt:null}});
  assert.equal(evaluate("document.querySelector('a[download]').href===document.querySelector('img[alt=\"Personal member QR\"]').src"),true);
  click("Replace personal QR");click("Replace QR");text("Personal QR replaced.");
  assert.ok((await admin.memberQr.findUniqueOrThrow({where:{id:oldQr.id}})).revokedAt);
  assert.equal(await admin.memberQr.count({where:{memberId:member.id,revokedAt:null}}),1);
  const receipt=await admin.paymentReceipt.findFirstOrThrow({where:{payment:{memberId:member.id}}});
  browser("click",`a[href="/receipts/${receipt.id}"]`);browser("wait","--url",`${origin}/receipts/${receipt.id}`);text("800.00");
  browser("open",`${origin}/members/${member.id}`);click("Record payment");click("Continue to payment");text("Saved charge preview");
  browser("fill","#cash-received","799.00");click("Review cash payment");text("Enter the exact full amount");assert.equal(await admin.payment.count({where:{memberId:member.id}}),1);
  browser("fill","#cash-received","800.00");click("Review cash payment");click("Confirm full cash");text("Full cash payment confirmed");
  assert.equal(await admin.payment.count({where:{memberId:member.id}}),2);capture("dark-confirmed-payment");
  click("Close membership payment");text("Paid next term:");click("Record payment");text("Another sale is blocked");assert.equal(evaluate("[...document.querySelectorAll('#membership-payment input[name=planId]')].every(i=>i.disabled)"),true);click("Close membership payment");
  const pending=await createMember(owner,{fullName:`Pending Profile ${suffix}`});
  browser("open",`${origin}/members/${pending.id}`);text("No confirmed payments recorded.");assert.equal(evaluate("!!document.querySelector('[role=progressbar]')"),false);audit("Pending profile");capture("dark-pending-profile");
  click("Issue personal QR");text("Current verified membership is required");assert.equal(await admin.memberQr.count({where:{memberId:pending.id}}),0);
  click("Record payment");click("Continue to payment");text("Saved charge preview");
  browser("find","role","radio","click","--name","Online","--exact");browser("fill","#online-reference",`SYNTHETIC-${suffix}`);browser("fill","#cash-received","800.00");click("Review online payment");text("Check the full funds");
  browser("check","input[type=checkbox]");click("Review online payment");
  // Lose the response after the real local server commits, then retry the stored operation.
  evaluate("window.realFetch=window.fetch;window.fetch=async(...args)=>{const response=await window.realFetch(...args);if(args[0]==='/api/payments/online')throw new TypeError('Synthetic response loss');return response};true");
  click("Confirm received online payment");text("Confirmation status unknown.");wait("document.querySelector('#membership-payment').getAttribute('aria-busy')==='false'");
  assert.equal(await admin.payment.count({where:{memberId:pending.id}}),1);
  click("Close membership payment");click("Record payment");text("Resolve payment confirmation");
  evaluate("window.fetch=window.realFetch;true");click("Retry same confirmation");text("Full online payment confirmed");
  assert.equal(await admin.payment.count({where:{memberId:pending.id}}),1);audit("Recovered Online payment");capture("dark-recovered-online");
  click("Close membership payment");text("Eligible");
  const currentQr=await admin.memberQr.findFirstOrThrow({where:{memberId:pending.id,revokedAt:null}});
  evaluate("window.realFetch=window.fetch;window.fetch=async(...args)=>{const response=await window.realFetch(...args);if(String(args[0]).endsWith('/qr'))throw new TypeError('Synthetic QR response loss');return response};true");
  click("Replace personal QR");click("Replace QR");text("QR action not confirmed.");
  assert.equal(evaluate("!!document.querySelector('img[alt=\"Personal member QR\"],a[download]')"),false,"Uncertain QR is not shareable");
  assert.ok((await admin.memberQr.findUniqueOrThrow({where:{id:currentQr.id}})).revokedAt);
  evaluate("window.fetch=window.realFetch;true");click("Retry same QR action");text("Personal QR replaced.");
  assert.equal(await admin.memberQr.count({where:{memberId:pending.id,revokedAt:null}}),1);
  console.log(process.argv.includes("--skip-matrix") ? "Responsive matrix skipped in this focused run." : "PASS: profile/dialog/AlertDialog Light/Dark at 1440/768/375/320, theme reload, axe and keyboard focus.");
  console.log("PASS: expired progress, receipt, short cash, cash renewal, scheduled sale block, Pending QR denial, Online attestation, lost-response payment and QR same-operation recovery.");

} catch(error) { try { browser("screenshot",resolve(output,"failure.png")); } catch {} throw error; }
finally {try{browser("close")}catch{} await admin.$disconnect();await db.$disconnect();}
