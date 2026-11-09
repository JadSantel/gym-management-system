import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { assertSynthetic } from "../src/lib/email";
import { bootstrapSyntheticOwner, completeSetup, reauthenticate, inviteStaff, setCapabilities } from "../src/lib/identity";
import { createMember } from "../src/lib/members";
import { changePlans } from "../src/lib/plans";
import { prepareCharge, confirmCash } from "../src/lib/charges";
import { attendanceHistory, memberQr, scanAttendance } from "../src/lib/attendance";
import { dayStart, manilaDay } from "../src/lib/attendance-schema";
assertSynthetic();
for (const key of ["DATABASE_URL","MIGRATION_DATABASE_URL"]) { const u=new URL(process.env[key]!); assert.equal(u.hostname,"127.0.0.1");assert.equal(u.port,"55432");assert.equal(u.pathname,"/gym_crm_synthetic"); }
const admin=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.MIGRATION_DATABASE_URL,options:"-c timezone=UTC"})});
const origin="http://127.0.0.1:3000", suffix=randomUUID().slice(0,8), session=`attendance-${suffix}`, binary=resolve(".local/browser-tools/agent-browser-win32-x64.exe"), output=resolve(".impeccable/review/attendance");mkdirSync(output,{recursive:true});
const password="Synthetic attendance browser 2026!", email=`attendance-browser-${suffix}@example.test`;let token="";
const sender={async send(message:{url:string}){token=new URL(message.url).hash.slice(1);}};
function browser(...args:string[]){const r=spawnSync(binary,["--session",session,...args],{encoding:"utf8",windowsHide:true,timeout:45000});if(r.status!==0)throw new Error(`Attendance browser ${args[0]} failed: ${args[0]==="fill"?"output withheld":r.stderr||r.stdout}`);return r.stdout;}
function evaluate(code:string){return JSON.parse(browser("eval",code,"--json")).data.result;}
const text=(value:string)=>browser("wait","--text",value), click=(name:string)=>browser("find","role","button","click","--name",name,"--exact");
function open(url:string){browser("open",url);browser("wait","--load","load");}
function capture(name:string){browser("wait","--fn","!document.querySelector('[data-slot=chart]')||document.querySelectorAll('[data-slot=chart] text').length>0");evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))");const r=browser("screenshot"),path=r.match(/Screenshot saved to (.+)/)?.[1]?.trim();assert.ok(path);copyFileSync(path,resolve(output,`${name}.png`));}
function audit(name:string){
 browser("wait","--fn","document.getAnimations().every(a=>a.playState!=='running')");
 browser("wait","--fn","!document.querySelector('[data-slot=chart]')||document.querySelectorAll('[data-slot=chart] text').length>0");
 assert.equal(evaluate("document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('[data-slot=\"table-container\"]')].every(e=>e.scrollWidth<=e.clientWidth)"),true,`${name} overflow`);
 const modal=evaluate("!!document.querySelector('[role=dialog]')");
 const result=JSON.parse(browser("a11y","--tags","wcag2a,wcag2aa",...(modal?["--selector","[role=dialog]"]:[]),"--json")).data;
 assert.equal(result.counts.violations,0,JSON.stringify({name,violations:result.violations}));
 let resolved=0;
 for(const item of result.incomplete??[]){
  if(item.id==="color-contrast"&&item.nodes.every((node:{target:string[]})=>node.target.every(selector=>evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});return !!el&&(!!el.closest('[data-slot=chart]')||el.matches('[data-slot=sheet-description]'))})()`)))){
   // Resolve only chart SVG/background and Sheet description overlap uncertainties, not arbitrary contrast findings.
   const ratios=evaluate(`(() => {
    const luminance=color=>{const rgb=color.match(/[\\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
    return [...document.querySelectorAll('[data-slot=chart] text, [data-slot=sheet-description]')].map(el=>{const foreground=luminance(el instanceof SVGElement?getComputedStyle(el).fill:getComputedStyle(el).color),surface=el.closest('[role=dialog]')??el.closest('[data-slot=card]'),background=luminance(getComputedStyle(surface).backgroundColor);return (Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05)});
   })()`);
   assert.ok(ratios.length>0&&ratios.every((ratio:number)=>ratio>=4.5),`${name} rendered label contrast ${JSON.stringify(ratios)}`);
   if(modal) assert.equal(evaluate("(() => {const el=document.querySelector('[data-slot=sheet-description]');if(!el)return true;const r=el.getBoundingClientRect(),top=document.elementFromPoint((r.left+r.right)/2,Math.max(0,Math.min(innerHeight-1,(r.top+r.bottom)/2))),style=getComputedStyle(el.closest('[role=dialog]'));return (top===el||el.contains(top))&&style.opacity==='1'&&style.backgroundImage==='none'&&!style.backgroundColor.includes('rgba')})()"),true,`${name} description is unobstructed on an opaque dialog`);
   resolved++;console.log(`${name}: axe contrast uncertainty resolved by computed contrast >=4.5:1${modal?" and unobstructed opaque dialog geometry":""}.`);
  }
 }
 assert.equal(result.counts.incomplete-resolved,0,JSON.stringify({name,incomplete:result.incomplete}));
 if(modal){
  const stops="[...document.querySelector('[role=dialog]').querySelectorAll('a[href],summary,button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex=\"0\"]')].filter(el=>el.getClientRects().length&&!el.closest('[hidden],[inert]'))";
  evaluate(`(${stops}).at(-1).focus();true`);browser("press","Tab");assert.equal(evaluate(`document.activeElement===(${stops})[0]`),true,`${name} forward focus wrap`);browser("press","Shift+Tab");assert.equal(evaluate(`document.activeElement===(${stops}).at(-1)`),true,`${name} reverse focus wrap`);
 }
}
function theme(value:string){browser("wait","--fn","!!document.querySelector('header time')?.getAttribute('datetime')");click("Appearance");browser("wait",'[role="dialog"]');click(value);}
let failure:unknown;
try{
 await admin.rateLimit.deleteMany(); const gymId=randomUUID();await bootstrapSyntheticOwner({gymId,gymName:"Synthetic Attendance Gym",name:"Attendance Reviewer",email},sender,admin);await completeSetup(token,password);
 const login=await auth.handler(new Request(origin+"/api/auth/sign-in/email",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({email,password})}));assert.equal(login.status,200);
 const owner=new Headers({cookie:login.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")});await reauthenticate(owner,password);
 const operator=await admin.operator.findFirstOrThrow({where:{gymId,role:"OWNER"}});
 const plans=await changePlans(owner,{action:"initialize"}),plan=plans.find(p=>p.durationDays===30)!;
 async function paid(name:string){const member=await createMember(owner,{fullName:name});const charge=await prepareCharge(owner,member.id,plan.id);await confirmCash(owner,charge.id,"800.00",randomUUID());return member;}
 async function seedHistoricalInterval(memberId:string,start:Date,end:Date){await admin.$transaction(async tx=>{const proposal=await tx.legacyRecord.create({data:{gymId,memberId,kind:"PREPARE",sourceReference:`ATTENDANCE-UI-${randomUUID()}`,sourceType:"GYM_REGISTER",corroboratingReference:`ATTENDANCE-UI-CARD-${randomUUID()}`,interpretation:"INSTANTS",claimedStart:start.toISOString(),claimedEnd:end.toISOString(),startsAt:start,endsAt:end,uncertainty:"CERTAIN",notes:"Synthetic retained interval fixture.",actorId:operator.id,operationKey:randomUUID(),fingerprint:"a".repeat(64)}});const approval=await tx.legacyRecord.create({data:{...proposal,id:randomUUID(),kind:"APPROVE",proposalId:proposal.id,notes:"Synthetic approved legacy fixture retained for browser coverage.",operationKey:randomUUID(),fingerprint:"b".repeat(64),createdAt:new Date()}});await tx.effectiveEntitlement.create({data:{gymId,memberId,legacyRecordId:approval.id,startsAt:start,endsAt:end}});});}
 const keyboard=await paid("Synthetic Keyboard Member"), camera=await paid("Synthetic Camera Member");
 const keyboardQr=await memberQr(owner,keyboard.id,{action:"issue",requestId:randomUUID()});await memberQr(owner,camera.id,{action:"issue",requestId:randomUUID()});
 // Deterministic synthetic regression: this valid pattern defeats ZXing's default perspective detector.
 const decoderRegressionCode=createHash("sha256").update("attendance-interoperability-15").digest("base64url");
 await admin.memberQr.updateMany({where:{code:decoderRegressionCode},data:{code:createHash("sha256").update(`retired-camera-fixture-${randomUUID()}`).digest("base64url")}});
 await admin.memberQr.updateMany({where:{memberId:camera.id,revokedAt:null},data:{code:decoderRegressionCode}});
 const cameraQr=await memberQr(owner,camera.id);assert.ok(keyboardQr);assert.ok(cameraQr);
 const missing=await createMember(owner,{fullName:"Synthetic Missing Checkout"});const old=new Date(Date.now()-86400000);
 await seedHistoricalInterval(missing.id,new Date(Date.now()-2*86400000),new Date(Date.now()+86400000));const missingQr=await memberQr(owner,missing.id,{action:"issue",requestId:randomUUID()});assert.ok(missingQr);await scanAttendance(owner,{code:missingQr.code,requestId:randomUUID()},()=>old);
 assert.equal((await fetch(origin+"/api/attendance")).status,401);
 assert.equal((await fetch(origin+`/api/members/${keyboard.id}/qr`)).status,401);
 open(origin+"/login");browser("fill","#identifier",email);browser("fill","#password",password);click("Sign in");text("Welcome, Attendance Reviewer");
 if(!process.argv.includes("--history-only")){
 open(origin+"/attendance/scanner");text("Keyboard scanner");
 browser("network","route","**/api/attendance/scan","--abort");browser("fill","#attendance-code",keyboardQr.code);browser("press","Enter");text("Attendance not confirmed.");assert.equal(evaluate("document.getElementById('attendance-code').disabled"),true);audit("uncertain scan");capture("scan-not-confirmed");
 browser("network","unroute");click("Retry same scan");text("IN: Check-in confirmed.");assert.equal(evaluate("document.activeElement.getAttribute('role')"),"status");
 browser("fill","#attendance-code",keyboardQr.code);browser("press","Enter");text("SUPPRESSED:");assert.equal(await admin.attendanceEvent.count({where:{memberId:keyboard.id}}),1);
 evaluate("navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Synthetic denial','NotAllowedError')};true");click("Start camera");text("Camera permission denied.");audit("camera denial");capture("camera-denied");
 // A canvas MediaStream exercises the real browser decoder without accessing any physical camera.
 evaluate("window.attendanceCanvas=document.createElement('canvas');attendanceCanvas.width=640;attendanceCanvas.height=480;window.attendanceContext=attendanceCanvas.getContext('2d');attendanceContext.fillStyle='white';attendanceContext.fillRect(0,0,640,480);navigator.mediaDevices.getUserMedia=async()=>{window.attendanceStream=attendanceCanvas.captureStream(10);return attendanceStream};true");
 click("Start camera");browser("wait","--fn","document.querySelector('video').srcObject?.active===true");
 evaluate(`(async()=>{const image=new Image();image.src=${JSON.stringify(cameraQr.png)};await image.decode();attendanceContext.drawImage(image,120,40,400,400);return true})()`);text("Synthetic Camera Member");text("IN: Check-in confirmed.");
 const accepted=Date.now();browser("wait","--fn",`Date.now()>=${accepted+8200}`);assert.equal(await admin.attendanceEvent.count({where:{memberId:camera.id}}),1,"same code remains latched beyond server cooldown");
 evaluate("attendanceContext.fillStyle='white';attendanceContext.fillRect(0,0,640,480);true");browser("wait","700");
 evaluate(`(async()=>{const image=new Image();image.src=${JSON.stringify(cameraQr.png)};await image.decode();attendanceContext.drawImage(image,120,40,400,400);return true})()`);text("OUT: Checkout confirmed.");
 click("Stop camera");assert.equal(evaluate("attendanceStream.getTracks().every(track=>track.readyState==='ended')"),true);
 click("Start camera");browser("wait","--fn","document.querySelector('video').srcObject?.active===true");browser("find","role","link","click","--name","Review attendance history and corrections","--exact");text("Recorded arrivals, departures");browser("wait","--fn","attendanceStream.getTracks().every(track=>track.readyState==='ended')");assert.equal(evaluate("attendanceStream.getTracks().every(track=>track.readyState==='ended')"),true,"navigation stops camera tracks");
 console.log("USB-style Enter, uncertain retry, suppression, real canvas QR decode, leave-view rearm, permission recovery and camera cleanup PASS.");
 }else{
  const scanTime=Date.now()-20000;
  await scanAttendance(owner,{code:keyboardQr.code,requestId:randomUUID()},()=>new Date(scanTime));
  await scanAttendance(owner,{code:cameraQr.code,requestId:randomUUID()},()=>new Date(scanTime));
  await scanAttendance(owner,{code:cameraQr.code,requestId:randomUUID()},()=>new Date(scanTime+10000));
 }
 const historyUrl=`${origin}/attendance?from=${manilaDay(old)}&to=${manilaDay(new Date())}`;
 for(const appearance of ["Light","Dark"]){
  for(const [surface,path] of [["history",historyUrl],["scanner",origin+"/attendance/scanner"],["qr",`${origin}/members/${keyboard.id}/qr`]]){
   open(path);theme(appearance);
   for(const [device,width,height] of [["desktop",1440,1000],["tablet",768,1000],["phone",375,900]] as const){
    browser("set","viewport",String(width),String(height));evaluate("scrollTo(0,0);document.getElementById('main').scrollTop=0;true");audit(`${appearance} ${surface} ${device}`);
    if(surface==="history") { assert.equal(evaluate("document.querySelectorAll('[aria-label=\"Today’s attendance summary\"] [data-slot=card]').length"),3); assert.equal(evaluate("document.querySelectorAll('thead th').length"),5); }
    capture(`${appearance.toLowerCase()}-${surface}-${device}`);
    if(device!=="desktop"&&surface==="history"){
     evaluate("document.querySelector('tbody').scrollIntoView({block:'start'});true");capture(`${appearance.toLowerCase()}-history-${device}-records`);
     evaluate("document.getElementById('main').scrollTop=document.getElementById('main').scrollHeight;true");capture(`${appearance.toLowerCase()}-history-${device}-end`);
    }
    if(device==="phone"&&surface!=="history"){
     evaluate("document.getElementById('main').scrollTop=document.getElementById('main').scrollHeight;true");capture(`${appearance.toLowerCase()}-${surface}-phone-end`);
    }
   }
  }
 }
 console.log("Attendance/history, scanner and personal QR Light/Dark desktop/tablet/phone matrix PASS.");
 open(historyUrl);click("Date range");click("Missing checkout");text("Synthetic Missing Checkout");browser("wait","--fn","document.querySelectorAll('tbody tr').length===1");capture("dark-missing-phone");
 open(historyUrl+"&member=Synthetic+Keyboard+Member");click("View visit for Synthetic Keyboard Member");browser("wait",'[role="dialog"]');evaluate("[...document.querySelectorAll('summary')].find(e=>e.textContent==='Correct or void this visit').scrollIntoView({block:'center'});true");browser("find","text","Correct or void this visit","click","--exact");click("Save audited change");text("Enter a required reason");
 for(const appearance of ["Light","Dark"]){browser("press","Escape");theme(appearance);click("View visit for Synthetic Keyboard Member");browser("wait",'[role="dialog"]');browser("find","text","Correct or void this visit","click","--exact");for(const width of [1440,375]){browser("set","viewport",String(width),"1000");evaluate("document.querySelector('details[open]').scrollIntoView({block:'start'});true");audit(`${appearance} open correction ${width}`);capture(`${appearance.toLowerCase()}-correction-form-${width}`);}}
 browser("set","viewport","320","900");audit("320px correction form");browser("set","viewport","375","900");
 const visit=await admin.attendanceVisit.findFirstOrThrow({where:{memberId:keyboard.id}});browser("select",`#action-${visit.id}`,"void");browser("fill",`#reason-${visit.id}`,"Synthetic accidental visit reviewed");click("Save audited change");text("Voided");assert.equal((await admin.attendanceVisit.findUniqueOrThrow({where:{id:visit.id}})).voided,true);evaluate("[...document.querySelectorAll('summary')].find(e=>e.textContent==='Original events and changes').scrollIntoView({block:'center'});true");browser("find","text","Original events and changes","click","--exact");text("Synthetic accidental visit reviewed");audit("audited void");capture("dark-correction-phone");
 open(`${origin}/members/${keyboard.id}/qr`);assert.equal(evaluate("document.querySelector('a[download]').getAttribute('download')"),"personal-member-qr.png");assert.equal(evaluate("document.querySelector('a[download]').href===document.querySelector('img[alt=\"Personal member QR\"]').src"),true);
 assert.equal(evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Print personal QR')"),false);
 click("Replace personal QR");click("Replace QR");text("The previous code is now invalid.");const oldResponse=await fetch(origin+"/api/attendance/scan",{method:"POST",headers:{origin,"content-type":"application/json",cookie:owner.get("cookie")!},body:JSON.stringify({code:keyboardQr.code,requestId:randomUUID()})});assert.equal((await oldResponse.json()).status,"DENIED");
 open(origin+"/attendance/scanner");browser("fill","#attendance-code",keyboardQr.code);browser("press","Enter");text("DENIED:");audit("revoked QR feedback");capture("dark-scan-denied-phone");
 open(historyUrl+"&member=No+matching+synthetic+member");text("No visits match these filters.");audit("empty history");evaluate("document.querySelector('[role=search]').scrollIntoView({block:'start'});true");capture("dark-history-empty-phone");
 // More than one page of real tenant-scoped visits; deterministic recorded intervals.
 await reauthenticate(owner,password);
 const paginated=await paid("Synthetic Pagination Member"), start=dayStart(manilaDay(new Date())), paginationQr=await memberQr(owner,paginated.id,{action:"issue",requestId:randomUUID()});assert.ok(paginationQr);
 const elapsed=Date.now()-start.getTime(), step=Math.min(120000,Math.floor(elapsed/60));
 assert.ok(step>=16000,"pagination fixtures need at least sixteen elapsed minutes today");
 for(let index=0;index<23;index++){
  const arrivedAt=new Date(start.getTime()+index*step),departedAt=new Date(arrivedAt.getTime()+Math.floor(step/2));
  assert.equal((await scanAttendance(owner,{code:paginationQr.code,requestId:randomUUID()},()=>arrivedAt)).status,"IN");
  assert.equal((await scanAttendance(owner,{code:paginationQr.code,requestId:randomUUID()},()=>departedAt)).status,"OUT");
 }
 open(origin+"/attendance");browser("set","viewport","1440","1000");text("Showing 1–10 of 25 visits");
 const stats=()=>evaluate("[...document.querySelectorAll('[aria-label=\"Today’s attendance summary\"] [data-slot=card] p')].map(e=>Number(e.textContent))");
 assert.deepEqual(stats(),[24,0,24]);
 browser("fill","#attendance-member","Synthetic Pagination Member");click("Search");text("Showing 1–10 of 23 visits");assert.deepEqual(stats(),[24,0,24]);
 click("Last page");text("Showing 21–23 of 23 visits");assert.equal(evaluate("document.querySelectorAll('tbody tr').length"),3);assert.equal(evaluate("document.querySelector('[aria-label=\"Last page\"]').disabled"),true);
 click("First page");text("Showing 1–10 of 23 visits");browser("select","#attendance-page-size","20");text("Showing 1–20 of 23 visits");click("Next page");text("Showing 21–23 of 23 visits");click("Previous page");text("Showing 1–20 of 23 visits");browser("select","#attendance-page-size","30");text("Showing 1–23 of 23 visits");
 browser("find","role","radio","click","--name","Inside","--exact");text("No visits match these filters.");assert.deepEqual(stats(),[24,0,24]);browser("find","role","radio","click","--name","Finished","--exact");text("Showing 1–23 of 23 visits");assert.ok(evaluate("[...document.querySelectorAll('td[data-label=Status]')].every(e=>e.textContent==='Finished')"));
 const summary=(await attendanceHistory(owner,{})).summary;assert.equal(summary.hours.some(hour=>(hour.occupancy??0)>0),true);
 browser("find","role","radio","click","--name","All","--exact");browser("wait","--fn","document.querySelector('[aria-label=\"Visit status\"] [aria-checked=true]').textContent==='All'&&document.querySelector('section[aria-label=\"Attendance history\"]').getAttribute('aria-busy')==='false'");browser("fill","#attendance-member","No matching person");click("Search");text("No visits match these filters.");click("Reset filters");text("Showing 1–25 of 25 visits");
 evaluate("window.attendanceFetch=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).includes('/attendance?'))await new Promise(resolve=>window.attendanceRelease=resolve);return window.attendanceFetch(...args)};true");
 browser("fill","#attendance-member","Pagination");click("Search");browser("wait","--fn","typeof window.attendanceRelease==='function'");assert.equal(evaluate("document.querySelector('section[aria-label=\"Attendance history\"]').getAttribute('aria-busy')"),"true");text("Loading attendance…");capture("dark-history-loading");evaluate("window.fetch=window.attendanceFetch;window.attendanceRelease();true");text("Showing 1–23 of 23 visits");click("Reset filters");text("Showing 1–25 of 25 visits");
 open(origin+"/attendance?pageSize=11");text("Check attendance filters");audit("invalid server filters");capture("invalid-attendance-filters");browser("find","role","link","click","--name","Reset to today","--exact");text("Showing 1–10 of 25 visits");browser("select","#attendance-page-size","30");text("Showing 1–25 of 25 visits");
 // Date validation, persisted theme, table/toolbar/footer and chart keyboard accessibility.
 for(const appearance of ["Light","Dark"]){
  theme(appearance);browser("reload");browser("wait","--fn",`document.documentElement.classList.contains('dark')===${appearance==="Dark"}`);
  for(const [device,width,height] of [["desktop",1440,1000],["tablet",768,1024],["phone",375,900],["narrow",320,900]] as const){
   browser("set","viewport",String(width),String(height));evaluate("document.getElementById('main').scrollTop=0;true");audit(`${appearance} populated attendance ${device}`);capture(`${appearance.toLowerCase()}-redesign-${device}`);
   evaluate("document.querySelector('tbody').scrollIntoView({block:'start'});true");capture(`${appearance.toLowerCase()}-redesign-${device}-records`);
   evaluate("document.querySelector('[aria-label=\"Attendance pages\"]').scrollIntoView({block:'center'});true");capture(`${appearance.toLowerCase()}-redesign-${device}-pagination`);
  }
   click("Today");evaluate("(() => {const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;for(const [id,value] of [['attendance-from','2026-11-04'],['attendance-to','2026-11-03']]){const el=document.getElementById(id);set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}return true})()");click("Apply dates");text("End date must be on or after start date.");audit(`${appearance} date validation`);browser("press","Escape");
 }
 browser("set","viewport","1440","1000");evaluate("document.querySelector('.recharts-surface').focus();true");browser("press","ArrowRight");assert.equal(evaluate("document.activeElement.classList.contains('recharts-surface')"),true);assert.equal(evaluate("document.querySelector('[data-slot=chart]').textContent.includes('NaN')"),false);audit("chart keyboard tooltip");
 click("View visit for Synthetic Camera Member");browser("wait",'[role="dialog"]');browser("press","Escape");assert.equal(evaluate("document.activeElement.getAttribute('aria-label')"),"View visit for Synthetic Camera Member");
 console.log("Daily tenant stats, peak chart, search/status, 10/20/30 pagination, theme persistence, date error, keyboard/focus and Light/Dark 1440/768/375/320 matrix PASS.");
 await reauthenticate(owner,password);await inviteStaff(owner,{name:"Attendance Browser Staff",username:`att_ui_${suffix}`,email:`att-ui-${suffix}@example.test`},sender);await completeSetup(token,password);const staff=await admin.operator.findFirstOrThrow({where:{gymId,role:"STAFF"}});await setCapabilities(owner,staff.id,{canManageMembers:true,canCollectCash:false});
 const signed=await auth.handler(new Request(origin+"/api/auth/sign-in/username",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({username:`att_ui_${suffix}`,password})}));const staffHeaders={cookie:signed.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")};assert.equal((await fetch(origin+"/api/attendance",{headers:staffHeaders})).status,200);await setCapabilities(owner,staff.id,{canManageMembers:false,canCollectCash:false});assert.equal((await fetch(origin+"/api/attendance",{headers:staffHeaders})).status,403);
 console.log("Missing-checkout filtering, required reason, audited void/original events, QR revocation and immediate staff-revocation HTTP checks PASS.");
}catch(error){failure=error;try{console.log("Chart diagnostic",evaluate("[...document.querySelectorAll('[data-slot=chart],.recharts-responsive-container,.recharts-wrapper,svg.recharts-surface')].map(el=>({tag:el.tagName,cls:el.getAttribute('class'),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,texts:el.querySelectorAll('text').length}))"));capture("failure");}catch{}}
finally{try{browser("close");}catch(error){failure??=error;}await db.$disconnect();await admin.$disconnect();}
if(failure)throw failure;
