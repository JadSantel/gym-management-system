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
import { legacyCommand } from "../src/lib/legacy";
import { memberQr, scanAttendance } from "../src/lib/attendance";
import { manilaDay } from "../src/lib/attendance-schema";
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
function capture(name:string){const r=browser("screenshot","--full"),path=r.match(/Screenshot saved to (.+)/)?.[1]?.trim();assert.ok(path);copyFileSync(path,resolve(output,`${name}.png`));}
function audit(name:string){browser("wait","--fn","document.getAnimations().every(a=>a.playState!=='running')");assert.equal(evaluate("document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('[data-slot=\"table-container\"]')].every(e=>e.scrollWidth<=e.clientWidth)"),true,`${name} overflow`);const result=JSON.parse(browser("a11y","--tags","wcag2a,wcag2aa","--json")).data;assert.equal(result.counts.violations,0,JSON.stringify({name,violations:result.violations}));assert.equal(result.counts.incomplete,0,JSON.stringify({name,incomplete:result.incomplete}));}
function theme(value:string){browser("wait","--fn","!!document.querySelector('header time')?.getAttribute('datetime')");click("Appearance");browser("wait",'[role="dialog"]');click(value);}
let failure:unknown;
try{
 await admin.rateLimit.deleteMany(); const gymId=randomUUID();await bootstrapSyntheticOwner({gymId,gymName:"Synthetic Attendance Gym",name:"Attendance Reviewer",email},sender,admin);await completeSetup(token,password);
 const login=await auth.handler(new Request(origin+"/api/auth/sign-in/email",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({email,password})}));assert.equal(login.status,200);
 const owner=new Headers({cookie:login.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")});await reauthenticate(owner,password);
 const plans=await changePlans(owner,{action:"initialize"}),plan=plans.find(p=>p.durationDays===30)!;
 async function paid(name:string){const member=await createMember(owner,{fullName:name});const charge=await prepareCharge(owner,member.id,plan.id);await confirmCash(owner,charge.id,"800.00",randomUUID());return member;}
 const keyboard=await paid("Synthetic Keyboard Member"), camera=await paid("Synthetic Camera Member");
 const keyboardQr=await memberQr(owner,keyboard.id,{action:"issue",requestId:randomUUID()});await memberQr(owner,camera.id,{action:"issue",requestId:randomUUID()});
 // Deterministic synthetic regression: this valid pattern defeats ZXing's default perspective detector.
 const decoderRegressionCode=createHash("sha256").update("attendance-interoperability-15").digest("base64url");
 await admin.memberQr.updateMany({where:{code:decoderRegressionCode},data:{code:createHash("sha256").update(`retired-camera-fixture-${randomUUID()}`).digest("base64url")}});
 await admin.memberQr.updateMany({where:{memberId:camera.id,revokedAt:null},data:{code:decoderRegressionCode}});
 const cameraQr=await memberQr(owner,camera.id);assert.ok(keyboardQr);assert.ok(cameraQr);
 const missing=await createMember(owner,{fullName:"Synthetic Missing Checkout"});const old=new Date(Date.now()-86400000);
 const proposal=await legacyCommand(owner,{action:"prepare",memberId:missing.id,previousId:null,sourceReference:`ATTENDANCE-UI-${suffix}`,sourceType:"GYM_REGISTER",corroboratingReference:`ATTENDANCE-UI-CARD-${suffix}`,interpretation:"INSTANTS",claimedStart:new Date(Date.now()-2*86400000).toISOString(),claimedEnd:new Date(Date.now()+86400000).toISOString(),uncertainty:"CERTAIN",notes:"Synthetic missing-checkout fixture."},randomUUID());
 await legacyCommand(owner,{action:"review",proposalId:proposal.id,decision:"APPROVE",independentlyChecked:true,notes:"Synthetic references reviewed."},randomUUID());const missingQr=await memberQr(owner,missing.id,{action:"issue",requestId:randomUUID()});assert.ok(missingQr);await scanAttendance(owner,{code:missingQr.code,requestId:randomUUID()},()=>old);
 assert.equal((await fetch(origin+"/api/attendance")).status,401);
 assert.equal((await fetch(origin+`/api/members/${keyboard.id}/qr`)).status,401);
 open(origin+"/login");browser("fill","#identifier",email);browser("fill","#password",password);click("Sign in");text("Welcome, Attendance Reviewer");
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
 const historyUrl=`${origin}/attendance?from=${manilaDay(old)}&to=${manilaDay(new Date())}`;
 for(const appearance of ["Light","Dark"]){
  for(const [surface,path] of [["history",historyUrl],["scanner",origin+"/attendance/scanner"],["qr",`${origin}/members/${keyboard.id}/qr`]]){
   open(path);theme(appearance);
   for(const [device,width,height] of [["desktop",1440,1000],["tablet",768,1000],["phone",375,900]] as const){
    browser("set","viewport",String(width),String(height));evaluate("scrollTo(0,0);document.getElementById('main').scrollTop=0;true");audit(`${appearance} ${surface} ${device}`);
    if(surface==="history"&&device==="phone")assert.equal(evaluate("['Member','Status'].every(label=>{const box=document.querySelector('tbody tr:first-child td[data-label='+label+']').getBoundingClientRect();const main=document.getElementById('main').getBoundingClientRect();return box.top>=main.top&&box.bottom<=main.bottom})"),true,"first phone visit identity and status stay above bottom navigation");
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
 open(historyUrl);browser("select","#attendance-view","MISSING");click("Apply filters");text("Synthetic Missing Checkout");assert.equal(evaluate("document.querySelectorAll('tbody tr').length"),1);capture("dark-missing-phone");
 open(historyUrl+"&member=Synthetic+Keyboard+Member");evaluate("[...document.querySelectorAll('summary')].find(e=>e.textContent==='Correct or void this visit').scrollIntoView({block:'center'});true");browser("find","text","Correct or void this visit","click","--exact");click("Save audited change");text("Enter a required reason");
 for(const appearance of ["Light","Dark"]){theme(appearance);for(const width of [1440,375]){browser("set","viewport",String(width),"1000");evaluate("document.querySelector('details[open]').scrollIntoView({block:'start'});true");audit(`${appearance} open correction ${width}`);capture(`${appearance.toLowerCase()}-correction-form-${width}`);}}
 browser("set","viewport","320","900");audit("320px correction form");browser("set","viewport","375","900");
 const visit=await admin.attendanceVisit.findFirstOrThrow({where:{memberId:keyboard.id}});browser("select",`#action-${visit.id}`,"void");browser("fill",`#reason-${visit.id}`,"Synthetic accidental visit reviewed");click("Save audited change");text("Voided");assert.equal((await admin.attendanceVisit.findUniqueOrThrow({where:{id:visit.id}})).voided,true);evaluate("[...document.querySelectorAll('summary')].find(e=>e.textContent==='Original events and changes').scrollIntoView({block:'center'});true");browser("find","text","Original events and changes","click","--exact");text("Synthetic accidental visit reviewed");audit("audited void");capture("dark-correction-phone");
 open(`${origin}/members/${keyboard.id}/qr`);assert.equal(evaluate("document.querySelector('a[download]').getAttribute('download')"),"personal-member-qr.png");assert.equal(evaluate("document.querySelector('a[download]').href===document.querySelector('img[alt=\"Personal member QR\"]').src"),true);
 evaluate("window.attendancePrintCount=0;window.print=()=>{window.attendancePrintCount++};true");click("Print personal QR");assert.equal(evaluate("attendancePrintCount"),1);
 click("Replace personal QR");text("The previous code is now invalid.");const oldResponse=await fetch(origin+"/api/attendance/scan",{method:"POST",headers:{origin,"content-type":"application/json",cookie:owner.get("cookie")!},body:JSON.stringify({code:keyboardQr.code,requestId:randomUUID()})});assert.equal((await oldResponse.json()).status,"DENIED");
 open(origin+"/attendance/scanner");browser("fill","#attendance-code",keyboardQr.code);browser("press","Enter");text("DENIED:");audit("revoked QR feedback");capture("dark-scan-denied-phone");
 open(historyUrl+"&member=No+matching+synthetic+member");text("No visits match these filters.");audit("empty history");capture("dark-history-empty-phone");
 await reauthenticate(owner,password);await inviteStaff(owner,{name:"Attendance Browser Staff",username:`att_ui_${suffix}`,email:`att-ui-${suffix}@example.test`},sender);await completeSetup(token,password);const staff=await admin.operator.findFirstOrThrow({where:{gymId,role:"STAFF"}});await setCapabilities(owner,staff.id,{canManageMembers:true,canCollectCash:false});
 const signed=await auth.handler(new Request(origin+"/api/auth/sign-in/username",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({username:`att_ui_${suffix}`,password})}));const staffHeaders={cookie:signed.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")};assert.equal((await fetch(origin+"/api/attendance",{headers:staffHeaders})).status,200);await setCapabilities(owner,staff.id,{canManageMembers:false,canCollectCash:false});assert.equal((await fetch(origin+"/api/attendance",{headers:staffHeaders})).status,403);
 console.log("Missing-checkout filtering, required reason, audited void/original events, QR revocation and immediate staff-revocation HTTP checks PASS.");
}catch(error){failure=error;try{capture("failure");}catch{}}
finally{try{browser("close");}catch(error){failure??=error;}await db.$disconnect();await admin.$disconnect();}
if(failure)throw failure;
