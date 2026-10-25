import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { assertSynthetic, type EmailSender } from "../src/lib/email";
import { bootstrapSyntheticOwner, completeSetup, inviteStaff, reauthenticate, setCapabilities } from "../src/lib/identity";
import { inGym } from "../src/lib/tenant";
import { setGymContext } from "../src/lib/binding";
import { createMember } from "../src/lib/members";
import { changePlans } from "../src/lib/plans";
import { proposedPeriod } from "../src/lib/charges";
import { digitalCommand } from "../src/lib/digital";
import { investigationCommand } from "../src/lib/investigations";
import { outageCommand } from "../src/lib/outage";
import { closingBounds, closingOverview, previousClosingDay } from "../src/lib/closing";
import { closingCommandSchema, closingDaySchema } from "../src/lib/closing-schema";
import { POST, GET } from "../src/app/api/closing/route";

assertSynthetic();
for (const key of ["DATABASE_URL","MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!); assert.equal(url.hostname,"127.0.0.1"); assert.equal(url.port,"55432"); assert.equal(url.pathname,"/gym_crm_synthetic");
}
assert.equal(process.env.BETTER_AUTH_URL,"http://127.0.0.1:3000");
const admin = new PrismaClient({adapter:new PrismaPg({connectionString:process.env.MIGRATION_DATABASE_URL,options:"-c timezone=UTC"})});
after(async () => { await db.$disconnect(); await admin.$disconnect(); });
const password = "Synthetic Closing Password 2026!"; const suffix = randomUUID().slice(0,8);
let link = ""; const sender: EmailSender = {async send(message) { link = new URL(message.url).hash.slice(1); }};
async function login(identifier: string, mode = "email") {
  const response = await auth.handler(new Request(`http://127.0.0.1:3000/api/auth/sign-in/${mode}`,{method:"POST",headers:{origin:"http://127.0.0.1:3000","content-type":"application/json"},body:JSON.stringify({[mode]:identifier,password})}));
  assert.equal(response.status,200); return new Headers({cookie:response.headers.getSetCookie().map(c => c.split(";")[0]).join("; ")});
}
function req(headers: Headers, body?: object, key = randomUUID(), query = "") {
  const h = new Headers(headers); h.set("origin","http://127.0.0.1:3000"); h.set("content-type","application/json"); h.set("idempotency-key",key);
  return new Request(`http://127.0.0.1:3000/api/closing${query}`,{method:body ? "POST":"GET",headers:h,...(body ? {body:JSON.stringify(body)}:{})});
}
async function ok(headers: Headers, body: object, key = randomUUID()) {
  const response = await POST(req(headers,body,key)); const result = await response.json(); assert.equal(response.status,200,JSON.stringify(result)); return result;
}

test("S-06 closing cutoff and strict untrusted input", () => {
  assert.deepEqual(closingBounds("2026-10-25"),{start:new Date("2026-10-24T16:00:00Z"),end:new Date("2026-10-25T16:00:00Z")});
  assert.equal(closingBounds("2024-02-29").end.getTime()-closingBounds("2024-02-29").start.getTime(),86400_000);
  for (const day of ["2026-02-29","2026-13-01","2026-10-25T00:00:00Z","1999-12-31"]) assert.equal(closingDaySchema.safeParse(day).success,false);
  const count = {action:"count",day:"2026-10-25",sourceHash:"a".repeat(64),collectorId:randomUUID(),method:"CASH",accountId:null,
    amount:"0.01",cashHeld:"0.01",transferred:"0",paidFromBatch:"0",evidenceReference:"COUNT-1",notes:"Synthetic count",independentlyChecked:true,segregated:true};
  assert.equal(closingCommandSchema.safeParse(count).success,true);
  for (const patch of [{amount:"1e2"},{amount:1},{amount:"1.001"},{amount:"21474836.48"},{amount:"NaN"},{gymId:randomUUID()},{submittedBy:randomUUID()},{independentlyChecked:false},{segregated:false},{evidenceReference:"https://secret?token=raw"}]) assert.equal(closingCommandSchema.safeParse({...count,...patch}).success,false);
});

test("S-06 real restricted PostgreSQL reconciliation and retained history", async t => {
  t.beforeEach(async () => {await admin.rateLimit.deleteMany();});
  await admin.rateLimit.deleteMany();
  const gyms = [randomUUID(),randomUUID()]; const owners: Headers[] = [];
  for (const [i,gymId] of gyms.entries()) {
    const email = `closing-owner-${i}-${suffix}@example.test`;
    await bootstrapSyntheticOwner({gymId,gymName:`Closing ${i}`,email,name:`Synthetic Closing Owner ${i}`},sender,admin);
    await completeSetup(link,password); const h = await login(email); await reauthenticate(h,password); owners.push(h);
  }
  const gymId = gyms[0]; const owner = await admin.operator.findFirstOrThrow({where:{gymId,role:"OWNER"}});
  const staff: {id:string;headers:Headers}[] = [];
  for (const name of ["collector","viewer","denied"]) {
    const username = `closing_${name}_${suffix}`;
    await inviteStaff(owners[0],{name:`Synthetic ${name}`,username,email:`${username}@example.test`},sender);
    await completeSetup(link,password); const h = await login(username,"username");
    const o = await admin.operator.findFirstOrThrow({where:{gymId,user:{username}}});
    await setCapabilities(owners[0],o.id,{canManageMembers:name!=="denied",canCollectCash:name==="collector"}); staff.push({id:o.id,headers:h});
  }
  const [collector,viewer,denied] = staff;
  await changePlans(owners[0],{action:"initialize"});
  const plan = await admin.plan.findFirstOrThrow({where:{gymId,durationDays:30}});
  const accounts: {id:string;method:string}[] = [];
  for (const method of ["GCASH","BANK"] as const) {
    const account = await digitalCommand(owners[0],{action:"account",label:`Closing ${method}`,method}) as {id:string;method:string};
    await digitalCommand(owners[0],{action:"verifier",accountId:account.id,operatorId:viewer.id,active:true}); accounts.push(account);
  }
  const day = previousClosingDay(); const {start,end} = closingBounds(day); const at = new Date(start.getTime()+3600_000);
  // Explicit historical synthetic setup under migration credentials. Closing commands below
  // use the real restricted runtime role; no clock override or mutation of original finance.
  async function payment(at: Date, who = collector.id, method = "CASH", memberId?: string) {
    const m = memberId ? {id:memberId} : await createMember(owners[0],{fullName:`Closing member ${randomUUID().slice(0,8)}`});
    return admin.$transaction(async tx => {
      const intervals = await tx.effectiveEntitlement.findMany({where:{memberId:m.id,isCurrentProjection:true}});
      const dates = proposedPeriod(at,30,intervals);
      const charge = await tx.charge.create({data:{gymId,memberId:m.id,planId:plan.id,planName:plan.name,durationDays:30,priceCentavos:80000,planVersion:plan.version,preparedBy:who,...dates}});
      const p = await tx.payment.create({data:{gymId,memberId:m.id,chargeId:charge.id,amountCentavos:80000,method,reference:`S06-${randomUUID()}`,collectedBy:who,collectedAt:at,enteredAt:at,verifiedBy:method==="CASH" ? who:viewer.id,verifiedAt:at}});
      const period = await tx.membershipPeriod.create({data:{gymId,memberId:m.id,paymentId:p.id,confirmedBy:p.verifiedBy,startsAt:dates.intendedStart,endsAt:dates.intendedEnd}});
      await tx.effectiveEntitlement.create({data:{gymId,memberId:m.id,periodId:period.id,startsAt:period.startsAt,endsAt:period.endsAt}});
      const receipt = await tx.paymentReceipt.create({data:{gymId,paymentId:p.id,reference:`S06-R-${randomUUID()}`}});
      if (method!=="CASH") {
        const account = accounts.find(a => a.method===method)!;
        const claim = await tx.digitalClaim.create({data:{gymId,chargeId:charge.id,accountId:account.id,amountCentavos:80000,transactionReference:`S06-T-${randomUUID()}`,reportedReceivedAt:at,collectedBy:who,enteredAt:at}});
        await tx.digitalSettlement.create({data:{gymId,claimId:claim.id,paymentId:p.id,evidenceReference:`S06-E-${randomUUID()}`}});
      }
      return {payment:p,period,receipt,member:m};
    });
  }
  const cash = await payment(at); await payment(at,owner.id); await payment(at,collector.id,"GCASH"); await payment(at,owner.id,"BANK");
  const pendingMember = await createMember(owners[0],{fullName:"Pending closing claim"});
  const pendingCharge = await admin.charge.create({data:{gymId,memberId:pendingMember.id,planId:plan.id,planName:plan.name,durationDays:30,priceCentavos:80000,planVersion:plan.version,preparedBy:collector.id,...proposedPeriod(at,30)}});
  const pending = await admin.digitalClaim.create({data:{gymId,chargeId:pendingCharge.id,accountId:accounts[0].id,amountCentavos:80000,transactionReference:`PENDING-${suffix}`,reportedReceivedAt:at,collectedBy:collector.id}});
  const book = await admin.outageBook.create({data:{gymId,code:`C${suffix.toUpperCase()}`,firstNumber:1,lastNumber:4,custodianId:collector.id,createdBy:owner.id,createdAt:new Date(start.getTime()-86400_000)}});
  await outageCommand(collector.headers,{action:"handover",bookId:book.id,toId:owner.id,actualAt:new Date(at.getTime()+3600_000).toISOString(),used:[1],unused:[2],void:[3],missing:[4],cashHeld:"800",cashTransferred:"0",transferReference:"NO-TRANSFER",evidenceReference:"SIGNED-S06",outstanding:"Receipt 1 unentered; leaf 4 missing; physical cash needs review",bothSigned:true},randomUUID());
  const differenceCase=await investigationCommand(collector.headers,{action:"open",memberId:cash.member.id,reason:"INCORRECT_ENTRY",summary:"Known member collection/count evidence for closing difference",method:"CASH"},randomUUID());
  const countCommand = (sourceHash: string,who:string,method="CASH",amount="800",accountId:string|null=null) => ({action:"count",day,sourceHash,collectorId:who,method,accountId,caseId:method==="CASH" && who===collector.id ? differenceCase.caseId:null,amount,cashHeld:method==="CASH" ? amount:"0",transferred:"0",paidFromBatch:"0",evidenceReference:`COUNT-${randomUUID()}`,notes:"Synthetic independent count; retained signed batch/account references",independentlyChecked:true,segregated:true});
  async function counts(overrides: Record<string,string> = {}) {
    const source = await closingOverview(collector.headers,day); const ids:string[] = [];
    const rows=[...source.rows];
    for(const check of source.checks) if(!rows.some(r=>r.collectorId===check.collectorId && r.method===check.method)) rows.push({collectorId:check.collectorId,method:check.method,recorded:0,excluded:0,refunds:0});
    for (const row of rows) {
      const amount = overrides[`${row.collectorId}:${row.method}`] ?? String((row.recorded-row.excluded)/100);
      if (row.method==="CASH") ids.push((await ok(collector.headers,countCommand(source.sourceHash,row.collectorId,row.method,amount))).id);
      else for (const account of accounts.filter(a => a.method===row.method)) ids.push((await ok(viewer.headers,countCommand(source.sourceHash,row.collectorId,row.method,amount,account.id))).id);
    }
    return {source,ids};
  }
  const submit = (sourceHash:string,checkIds:string[],previousId:string|null=null) => ({action:"submit",day,sourceHash,checkIds,previousId,evidenceReference:"CLOSE-S06",notes:"Shortage/excess retained; missing leaf and pending transfer remain open",countsReaffirmed:true});
  const approve = (snapshotId:string,sourceHash:string) => ({action:"approve",snapshotId,sourceHash,evidenceReference:"OWNER-S06",notes:"Acknowledged unresolved differences; investigate without changing amounts",acknowledgeUnresolved:true});
  let originalId = ""; let originalSource = "";
  await t.test("all methods and collectors, pending funds and paper/custody exceptions remain separate", async () => {
    const source = await closingOverview(collector.headers,day);
    assert.equal(source.rows.length,4); assert.equal(source.rows.reduce((sum,r) => sum+r.recorded,0),320000);
    for (const kind of ["PENDING_TRANSFER","UNENTERED_RECEIPT","VOID","MISSING","CUSTODY_NOTE","INVESTIGATION"]) assert.ok(source.items.some(i => i.kind===kind),kind);
    assert.equal(source.items.find(i => i.kind==="PENDING_TRANSFER")!.reference,pending.id);
    assert.equal(await admin.payment.count({where:{memberId:pendingMember.id}}),0);
    const {ids} = await counts({[`${collector.id}:CASH`] : "750",[`${owner.id}:CASH`] : "850"});
    const command = submit(source.sourceHash,ids); const key = randomUUID();
    const results = await Promise.all([ok(collector.headers,command,key),ok(collector.headers,command,key)]);
    assert.equal(results[0].id,results[1].id); originalId=results[0].id; originalSource=JSON.stringify(results[0].source);
    assert.equal((await ok(collector.headers,command,key)).id,originalId,"lost response same-key replay");
    const lines = await admin.closingLine.findMany({where:{snapshotId:originalId}});
    assert.equal(lines.find(l => l.collectorId===collector.id && l.method==="CASH")!.difference,-5000);
    assert.equal(lines.find(l => l.collectorId===owner.id && l.method==="CASH")!.difference,5000);
    assert.equal((await POST(req(collector.headers,{...command,notes:"changed"},key))).status,409);
    assert.equal((await POST(req(collector.headers,command))).status,409,"distinct-key competing original close");
  });
  await t.test("staff cannot approve; owner fresh approval preserves shortage/excess and every original record", async () => {
    const source = await closingOverview(owners[0],day); const command=approve(originalId,source.sourceHash);
    assert.equal((await POST(req(collector.headers,command))).status,403);
    const session=await auth.api.getSession({headers:owners[0]}); await admin.session.update({where:{id:session!.session.id},data:{reauthenticatedAt:new Date(0)}});
    assert.equal((await POST(req(owners[0],command))).status,403); await reauthenticate(owners[0],password);
    const key=randomUUID(); const results=await Promise.all([ok(owners[0],command,key),ok(owners[0],command,key)]); assert.equal(results[0].id,results[1].id);
    assert.equal((await ok(owners[0],command,key)).id,results[0].id);
    assert.equal(JSON.stringify((await admin.closingSnapshot.findUniqueOrThrow({where:{id:originalId}})).source),originalSource);
    assert.equal((await closingOverview(owners[0],day)).items.length,source.items.length);
    assert.deepEqual(await admin.payment.findUnique({where:{id:cash.payment.id}}),cash.payment);
  });
  await t.test("strict request allowlists, direct unauthorized/cross-tenant checks and designated digital evidence", async () => {
    const source=await closingOverview(collector.headers,day); const command=countCommand(source.sourceHash,collector.id);
    for (const patch of [{gymId:gyms[1]},{amount:"800.001"},{notes:""},{cashHeld:"799"},{accountId:accounts[0].id},{cashHeld:"0",paidFromBatch:"800"}]) assert.equal((await POST(req(collector.headers,{...command,...patch}))).status,400);
    assert.equal((await POST(req(new Headers(),command))).status,401);
    assert.equal((await POST(req(collector.headers,{...command,caseId:randomUUID()}))).status,404);
    assert.equal((await POST(req(denied.headers,command))).status,403);
    assert.equal((await POST(req(owners[1],command))).status,409,"foreign source hash rejected");
    assert.equal((await POST(req(collector.headers,countCommand(source.sourceHash,collector.id,"GCASH","800",accounts[0].id)))).status,403);
    assert.equal((await POST(req(owners[0],countCommand(source.sourceHash,collector.id,"GCASH","800",accounts[0].id)))).status,403,"owner has no implicit account designation");
    assert.equal((await POST(req(owners[1],approve(originalId,source.sourceHash)))).status,404);
    assert.equal((await GET(req(collector.headers,undefined,randomUUID(),`?day=${day}&day=${day}`))).status,400);
    assert.equal((await GET(req(owners[1],undefined,randomUUID(),`?day=${day}`))).status,200);
    const foreign=await closingOverview(owners[1],day); assert.equal(foreign.snapshots.length,0); assert.equal(foreign.checks.length,0);
  });
  await t.test("exclusive cutoff assigns exact midnight once, including leap and month-end bounds", async () => {
    const before=await closingOverview(collector.headers,day);
    const ps=await Promise.all([payment(new Date(start.getTime()-1)),payment(start),payment(new Date(end.getTime()-1)),payment(end,owner.id)]);
    const after=await closingOverview(collector.headers,day);
    for (const [i,p] of ps.entries()) assert.equal(after.collections.some(c => c.id===p.payment.id),i===1 || i===2);
    const nextDay=new Date(end.getTime()+8*3600_000).toISOString().slice(0,10);
    const next=await closingOverview(collector.headers,nextDay); assert.ok(next.collections.some(p => p.id===ps[3].payment.id));
    assert.notEqual(after.sourceHash,before.sourceHash);
    assert.equal(closingBounds("2026-01-31").end.toISOString(),"2026-01-31T16:00:00.000Z");
  });
  await t.test("late owner recovery changes original day only and requires explicit new evidence/supplement", async () => {
    const member=await createMember(owners[0],{fullName:"Late recovered closing member"});
    const opened=await investigationCommand(collector.headers,{action:"open",memberId:member.id,reason:"MISSING_PAYMENT",summary:"Independent omitted cash",method:"CASH",claimedAmount:"800",originalCollectedAt:at.toISOString()},randomUUID());
    const c=await admin.investigationCase.findUniqueOrThrow({where:{id:opened.caseId}});
    async function event(command:object) { const last=await admin.investigationEvent.findFirstOrThrow({where:{caseId:c.id},orderBy:{revision:"desc"}}); return {caseId:c.id,expectedRevision:last.revision,reasoning:"Independent local synthetic evidence",evidenceReference:`RECOVERY-${randomUUID()}`,...command}; }
    const approved=await investigationCommand(owners[0],await event({action:"approveRecovery",planId:plan.id,collectorId:collector.id,independentEvidenceReference:`OMITTED-${suffix}`,independentlyVerified:true,originalDateVerified:true,omittedPaymentVerified:true}),randomUUID());
    const command=await event({action:"recover",approvalEventId:approved.id}); const key=randomUUID();
    const recovered=await investigationCommand(owners[0],command,key); assert.equal((await investigationCommand(owners[0],command,key)).id,recovered.id);
    const source=await closingOverview(collector.headers,day); assert.equal(source.collections.filter(p => p.id===recovered.paymentId).length,1);
    const today=new Date(Date.now()+8*3600_000).toISOString().slice(0,10); const current=await closingOverview(collector.headers,today);
    assert.ok(!current.collections.some(p => p.id===recovered.paymentId)); assert.ok(current.changes.some(e => e.id===recovered.id));
    const oldChecks=await admin.closingCheck.findMany({where:{gymId,sourceHash:JSON.parse(originalSource).sourceHash}});
    assert.equal((await POST(req(collector.headers,submit(source.sourceHash,oldChecks.map(c => c.id),originalId)))).status,409);
    const fresh=await counts(); const supplement=await ok(collector.headers,submit(fresh.source.sourceHash,fresh.ids,originalId));
    assert.equal(supplement.revision,2); assert.equal(supplement.previousId,originalId);
    assert.equal((await POST(req(owners[0],approve(originalId,source.sourceHash)))).status,409);
    await ok(owners[0],approve(supplement.id,fresh.source.sourceHash));
    assert.equal(JSON.stringify((await admin.closingSnapshot.findUniqueOrThrow({where:{id:originalId}})).source),originalSource);
  });
  await t.test("source changes invalidate approval and old counts even when transaction values stay immutable", async () => {
    const fresh=await counts(); const latest=fresh.source.snapshots.at(-1)!;
    const check=fresh.ids[0];
    await investigationCommand(collector.headers,{action:"open",memberId:cash.member.id,reason:"INCORRECT_ENTRY",summary:"Additional unresolved evidence",method:"CASH"},randomUUID());
    assert.equal((await POST(req(owners[0],approve(latest.id,fresh.source.sourceHash)))).status,409);
    const source=await closingOverview(collector.headers,day); assert.equal((await POST(req(collector.headers,submit(source.sourceHash,[check],latest.id)))).status,409);
  });
  await t.test("outage entry stays pending, later independent verification counts one original-day collection", async () => {
    const price=await admin.outagePrice.create({data:{gymId,bookId:book.id,planId:plan.id,planName:plan.name,planVersion:plan.version,durationDays:30,priceCentavos:80000}});
    const member=await createMember(owners[0],{fullName:"S06 recovered outage"});
    const before=await closingOverview(collector.headers,day);
    await outageCommand(owners[0],{action:"verifier",operatorId:viewer.id,active:true},randomUUID());
    const entered=await outageCommand(collector.headers,{action:"enter",bookId:book.id,number:1,memberId:member.id,priceId:price.id,method:"CASH",amount:"800",collectorId:collector.id,
      collectedAt:at.toISOString(),issuedAt:new Date(at.getTime()+1000).toISOString(),historyCertain:true,receiptReference:`PAPER-S06-${suffix}`,cashReference:`BATCH-S06-${suffix}`,visit:null},randomUUID());
    const entryId=(entered.result as {entryId:string}).entryId;
    const pendingSource=await closingOverview(collector.headers,day);
    assert.deepEqual(pendingSource.rows,before.rows); assert.ok(pendingSource.items.some(i => i.kind==="PENDING_PAPER" && i.reference===entryId));
    const command={action:"verify",bookId:book.id,entryId,receiptEvidence:"S06-RETAINED",cashEvidence:"S06-INDEPENDENT-CASH",custodyEvidence:"S06-SIGNED-HANDOVER",independentlyMatched:true};
    const key=randomUUID(); const result=await outageCommand(viewer.headers,command,key); assert.equal((await outageCommand(viewer.headers,command,key)).id,result.id);
    const paymentId=(result.result as {paymentId:string}).paymentId;
    const source=await closingOverview(collector.headers,day); assert.equal(source.collections.filter(p => p.id===paymentId).length,1);
    assert.equal(source.rows.find(r => r.collectorId===collector.id && r.method==="CASH")!.recorded-before.rows.find(r => r.collectorId===collector.id && r.method==="CASH")!.recorded,80000);
    const today=new Date(Date.now()+8*3600_000).toISOString().slice(0,10); const later=await closingOverview(collector.headers,today);
    assert.ok(!later.collections.some(p => p.id===paymentId)); assert.ok(later.changes.some(e => e.paymentId===paymentId && e.kind==="OUTAGE_VERIFIED"));
    assert.ok(!source.items.some(i => i.kind==="UNENTERED_RECEIPT" && i.reference===`${book.id}:1`));
    assert.equal(await admin.payment.count({where:{outageEntryId:entryId}}),1);
  });
  await t.test("owner zero-movement corrections and separate verified refund settlement explain original and later day", async () => {
    async function adjustment(reason:string) {
      const first=await payment(at); const second=await payment(at,collector.id,"CASH",first.member.id);
      const opened=await investigationCommand(collector.headers,{action:"open",memberId:first.member.id,reason,summary:`Closing ${reason}`,method:"CASH"},randomUUID());
      async function event(command:object) {const last=await admin.investigationEvent.findFirstOrThrow({where:{caseId:opened.caseId},orderBy:{revision:"desc"}}); return {caseId:opened.caseId,expectedRevision:last.revision,reasoning:"Independent evidence for closing",evidenceReference:`S06-${randomUUID()}`,...command};}
      const request=await investigationCommand(collector.headers,await event({action:"request",reason,paymentId:second.payment.id,relatedPaymentId:first.payment.id,periodId:second.period.id,retainedPeriodId:first.period.id,
        collectionCount:reason==="TWO_COLLECTIONS" ? "TWO":"ONE",amount:reason==="TWO_COLLECTIONS" ? "800":"0",method:"CASH",moneyOutcome:reason==="TWO_COLLECTIONS" ? "REFUND_PROPOSED":"NO_MOVEMENT",
        accessOutcome:"STAYS",effectiveAt:new Date().toISOString(),independentEvidenceReference:`DISTINCT-${randomUUID()}`,sameObligation:true,unintendedCollection:true}),randomUUID());
      await investigationCommand(owners[0],await event({action:"review",requestEventId:request.id,decision:"APPROVE"}),randomUUID());
      const approved=await closingOverview(collector.headers,day);
      assert.equal(approved.collections.find(p => p.id===second.payment.id)!.excluded,false,"approval alone changes no amount");
      const executed=await investigationCommand(owners[0],await event({action:"executeApproved",requestEventId:request.id,independentEvidenceReference:`EXEC-${randomUUID()}`,independentlyVerified:true}),randomUUID());
      return {first,second,executed,event};
    }
    const duplicate=await adjustment("DUPLICATE_RECORD");
    const corrected=await closingOverview(collector.headers,day);
    assert.ok(corrected.collections.find(p => p.id===duplicate.second.payment.id)!.excluded);
    assert.equal(corrected.rows.find(r => r.collectorId===collector.id && r.method==="CASH")!.excluded,80000);
    const excess=await adjustment("TWO_COLLECTIONS");
    const before=await closingOverview(collector.headers,day); assert.equal(before.rows.reduce((s,r) => s+r.refunds,0),0);
    assert.equal(excess.executed.outcome,"AWAITING_SETTLEMENT");
    const settlement=await investigationCommand(owners[0],await excess.event({action:"settle",executionEventId:excess.executed.id,independentEvidenceReference:`PAID-${randomUUID()}`,independentlyVerified:true,
      settlementReference:`REFUND-${suffix}`,settledAt:new Date().toISOString(),amount:"800",method:"CASH"}),randomUUID());
    const original=await closingOverview(collector.headers,day); assert.equal(original.rows.reduce((s,r) => s+r.refunds,0),0,"refund belongs to actual settlement day");
    assert.ok(original.changes.some(e => e.id===settlement.id && e.collectedAt!.getTime()===at.getTime()));
    const today=new Date(Date.now()+8*3600_000).toISOString().slice(0,10); const settled=await closingOverview(collector.headers,today);
    const row=settled.rows.find(r => r.collectorId===collector.id && r.method==="CASH")!; assert.equal(row.refunds,80000); assert.equal(row.recorded-row.excluded-row.refunds,-80000,"refund-only day net is negative");
    const event=settled.changes.find(e => e.id===settlement.id)!; assert.equal(event.actorId,owner.id); assert.ok(event.settledAt);
    assert.deepEqual(await admin.payment.findUnique({where:{id:excess.second.payment.id}}),excess.second.payment);
    assert.deepEqual(await admin.payment.findUnique({where:{id:duplicate.second.payment.id}}),duplicate.second.payment);
    assert.equal(JSON.stringify((await admin.closingSnapshot.findUniqueOrThrow({where:{id:originalId}})).source),originalSource);
  });
  await t.test("bank collection refunded in cash preserves original allocation and actual payout in a closed snapshot", async () => {
    const retained=await payment(at,collector.id,"BANK");
    const affected=await payment(at,collector.id,"BANK",retained.member.id);
    // Historical synthetic approved/settled event graph, not a backdating API. Application
    // settlement already has separate real owner-flow coverage above. Close this ended day
    // under the restricted role to exercise deferred physical-cash source coverage.
    const settlement=await admin.$transaction(async tx=>{
      const record=await tx.investigationCase.create({data:{gymId,memberId:affected.member.id,reason:"TWO_COLLECTIONS",summary:"Historical synthetic bank excess refunded in cash",method:"BANK",openedBy:owner.id,openedAt:at}});
      const base={gymId,caseId:record.id,fingerprint:"b".repeat(64),reasoning:"Historical independent synthetic evidence",evidenceReference:"HIST-PRIMARY",actorId:owner.id,createdAt:at};
      await tx.investigationEvent.create({data:{...base,operationKey:randomUUID(),revision:1,kind:"OPEN",outcome:"OPEN"}});
      const request=await tx.investigationEvent.create({data:{...base,operationKey:randomUUID(),revision:2,kind:"REQUEST",outcome:"OWNER_REVIEW",reason:"TWO_COLLECTIONS",
        paymentId:affected.payment.id,relatedPaymentId:retained.payment.id,periodId:affected.period.id,retainedPeriodId:retained.period.id,collectionCount:"TWO",amountCentavos:80000,
        method:"CASH",moneyOutcome:"REFUND_PROPOSED",accessOutcome:"STAYS",effectiveAt:at,independentEvidenceReference:"HIST-BANK-TWO",sameObligation:true,unintendedCollection:true}});
      const approval=await tx.investigationEvent.create({data:{...base,operationKey:randomUUID(),revision:3,kind:"REVIEW",outcome:"APPROVED",requestEventId:request.id,decision:"APPROVE"}});
      const execution=await tx.investigationEvent.create({data:{...base,operationKey:randomUUID(),revision:4,kind:"EXECUTE_APPROVED",outcome:"AWAITING_SETTLEMENT",paymentId:affected.payment.id,
        relatedPaymentId:retained.payment.id,periodId:affected.period.id,requestEventId:request.id,approvalEventId:approval.id,amountCentavos:80000,method:"CASH",accessOutcome:"STAYS",effectiveAt:at,
        evidenceReference:"HIST-EXEC",independentEvidenceReference:"HIST-EXEC-INDEPENDENT"}});
      return tx.investigationEvent.create({data:{...base,operationKey:randomUUID(),revision:5,kind:"SETTLE",outcome:"COMPLETED",executionEventId:execution.id,method:"CASH",amountCentavos:80000,
        settledAt:at,settlementReference:`HIST-CASH-REFUND-${suffix}`,evidenceReference:"HIST-PAYOUT",independentEvidenceReference:"HIST-PAYOUT-INDEPENDENT"}});
    });
    const source=await closingOverview(collector.headers,day);
    const movement=source.refundMovements.find(r=>r.id===settlement.id)!;
    assert.equal(movement.originalMethod,"BANK");assert.equal(movement.actualMethod,"CASH");assert.equal(movement.collectorId,collector.id);assert.equal(movement.settledBy,owner.id);
    assert.equal(source.rows.find(r=>r.collectorId===collector.id && r.method==="BANK")!.refunds,80000);
    assert.equal(source.rows.find(r=>r.collectorId===collector.id && r.method==="CASH")!.refunds,0,"cash payout must not change original-method allocation");
    const fresh=await counts();
    const cashRow=source.rows.find(r=>r.collectorId===collector.id && r.method==="CASH")!;const gross=cashRow.recorded-cashRow.excluded;
    const command={...countCommand(source.sourceHash,collector.id,"CASH",String(gross/100)),cashHeld:String((gross-80000)/100),paidFromBatch:"800"};
    const check=await ok(collector.headers,command);
    const previousCheck=await admin.closingCheck.findFirstOrThrow({where:{id:{in:fresh.ids},collectorId:collector.id,method:"CASH"}});
    const ids=fresh.ids.map(id=>id===previousCheck.id ? check.id:id);
    const snapshot=await ok(collector.headers,submit(source.sourceHash,ids,fresh.source.snapshots.at(-1)!.id));
    const line=await admin.closingLine.findFirstOrThrow({where:{snapshotId:snapshot.id,collectorId:collector.id,method:"CASH"}});
    assert.equal(line.difference,0);assert.equal(line.refunds,0);
    const captured=snapshot.source as {refundMovements:{actualMethod:string;originalMethod:string}[]};
    assert.equal(captured.refundMovements[0].actualMethod,"CASH");assert.equal(captured.refundMovements[0].originalMethod,"BANK");
    await ok(owners[0],approve(snapshot.id,source.sourceHash));
    assert.equal((await POST(req(collector.headers,{...command,cashHeld:String((gross-80001)/100),paidFromBatch:"800.01"}))).status,400,"no extra cash payout may be invented");
  });
  await t.test("replacing independently checked actuals makes an unapproved snapshot stale", async () => {
    const fresh=await counts(); const snapshot=await ok(collector.headers,submit(fresh.source.sourceHash,fresh.ids,fresh.source.snapshots.at(-1)!.id));
    await ok(collector.headers,countCommand(fresh.source.sourceHash,viewer.id,"CASH","50"));
    assert.equal((await POST(req(owners[0],approve(snapshot.id,fresh.source.sourceHash)))).status,409,"new unrecorded collector evidence cannot be omitted");
    assert.equal((await POST(req(collector.headers,submit(fresh.source.sourceHash,fresh.ids,snapshot.id)))).status,409);
    await ok(collector.headers,countCommand(fresh.source.sourceHash,collector.id,"CASH","1"));
    assert.equal((await POST(req(owners[0],approve(snapshot.id,fresh.source.sourceHash)))).status,409);
    assert.equal((await POST(req(collector.headers,submit(fresh.source.sourceHash,fresh.ids,snapshot.id)))).status,409);
  });
  await t.test("injected audit failure rolls back snapshot, lines and links; original key then succeeds", async () => {
    const fresh=await counts(); const command=submit(fresh.source.sourceHash,fresh.ids,fresh.source.snapshots.at(-1)!.id); const key=randomUUID();
    await admin.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION public.fail_s06_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'CLOSING_%SUBMITTED' THEN RAISE EXCEPTION 'synthetic closing rollback'; END IF; RETURN NEW; END $$`);
    await admin.$executeRawUnsafe('CREATE TRIGGER fail_s06_audit BEFORE INSERT ON identity_audit FOR EACH ROW EXECUTE FUNCTION public.fail_s06_audit()');
    try { assert.equal((await POST(req(collector.headers,command,key))).status,500); assert.equal(await admin.closingSnapshot.count({where:{gymId,operationKey:key}}),0); }
    finally { await admin.$executeRawUnsafe('DROP TRIGGER fail_s06_audit ON identity_audit'); await admin.$executeRawUnsafe('DROP FUNCTION public.fail_s06_audit()'); }
    const result=await ok(collector.headers,command,key); assert.equal(result.revision,fresh.source.snapshots.at(-1)!.revision+1);
    assert.equal(await admin.closingLine.count({where:{snapshotId:result.id}}),fresh.ids.length,"one checked account per method in this fixture");
  });
  await t.test("distinct concurrent submissions and owner approvals serialize without duplicate results", async () => {
    const fresh=await counts(); const command=submit(fresh.source.sourceHash,fresh.ids,fresh.source.snapshots.at(-1)!.id);
    const responses=await Promise.all([POST(req(collector.headers,command)),POST(req(collector.headers,command))]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    const result=await responses.find(r=>r.status===200)!.json();
    const approval=approve(result.id,fresh.source.sourceHash);
    const approvals=await Promise.all([POST(req(owners[0],approval)),POST(req(owners[0],approval))]);
    assert.deepEqual(approvals.map(r=>r.status).sort(),[200,409]);
    assert.equal(await admin.closingApproval.count({where:{snapshotId:result.id}}),1);
    assert.equal(await admin.closingSnapshot.count({where:{gymId,day,revision:result.revision}}),1);
  });
  await t.test("real RLS, tenant FKs, immutable child/history and pooled context isolation", async () => {
    const roles=await db.$queryRaw<{rolsuper:boolean;rolbypassrls:boolean}[]>`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
    assert.equal(roles[0].rolsuper,false); assert.equal(roles[0].rolbypassrls,false);
    const policies=await admin.$queryRaw<{relname:string;relrowsecurity:boolean;relforcerowsecurity:boolean}[]>`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('closing_checks','closing_snapshots','closing_lines','closing_line_checks','closing_approvals')`;
    assert.equal(policies.length,5); assert.ok(policies.every(p => p.relrowsecurity && p.relforcerowsecurity));
    assert.equal(await db.closingSnapshot.count(),0); assert.equal(await db.closingCheck.count(),0);
    await assert.rejects(inGym(collector.headers,"CASH",tx => tx.closingSnapshot.update({where:{id:originalId},data:{notes:"overwrite"}})));
    const line=await admin.closingLine.findFirstOrThrow({where:{snapshotId:originalId}});
    await assert.rejects(admin.closingLine.update({where:{id:line.id},data:{grossActual:1,difference:1-line.recorded+line.excluded}}));
    await assert.rejects(admin.closingLine.create({data:{gymId,snapshotId:originalId,collectorId:viewer.id,method:"CASH",recorded:0,excluded:0,refunds:0,grossActual:0,difference:0}}),/Submitted closing children/);
    const check=await admin.closingCheck.findFirstOrThrow({where:{gymId}});
    await assert.rejects(admin.closingLineCheck.create({data:{gymId,lineId:line.id,checkId:check.id}}));
    await assert.rejects(admin.closingApproval.update({where:{snapshotId:originalId},data:{notes:"clear shortage"}}));
    const latest=await admin.closingSnapshot.findFirstOrThrow({where:{gymId,day},orderBy:{revision:"desc"}});
    const extra={gymId,day,revision:latest.revision+1,previousId:latest.id,sourceHash:latest.sourceHash,source:latest.source!,evidenceReference:"INCOMPLETE-DB",notes:"Synthetic incomplete result must roll back",submittedBy:collector.id,operationKey:randomUUID(),fingerprint:"a".repeat(64)};
    await assert.rejects(inGym(collector.headers,"CASH",tx=>tx.closingSnapshot.create({data:extra})),/complete matched/);
    const capturedLine=await admin.closingLine.findFirstOrThrow({where:{snapshotId:latest.id}});
    const capturedCheck=await admin.closingLineCheck.findFirstOrThrow({where:{lineId:capturedLine.id}});
    await assert.rejects(inGym(collector.headers,"CASH",async tx=>{
      const s=await tx.closingSnapshot.create({data:extra});
      const l=await tx.closingLine.create({data:{...capturedLine,id:randomUUID(),snapshotId:s.id}});
      await tx.closingLineCheck.create({data:{gymId,lineId:l.id,checkId:capturedCheck.checkId}});
    }),/cover captured source rows/);
    const foreignOwner=await admin.operator.findFirstOrThrow({where:{gymId:gyms[1],role:"OWNER"}});
    await assert.rejects(inGym(collector.headers,"CASH",tx => tx.closingCheck.create({data:{...check,ordinal:undefined,id:randomUUID(),operationKey:randomUUID(),collectorId:foreignOwner.id}})));
    const isolated=await Promise.all(Array.from({length:12},(_,i) => db.$transaction(async tx => {await setGymContext(tx,gyms[i%2]); const rows=await tx.closingSnapshot.findMany(); assert.ok(rows.every(r => r.gymId===gyms[i%2])); return rows.length;})));
    assert.ok(isolated.some(n => n>0)); assert.equal(await db.closingSnapshot.count(),0);
  });
  await t.test("open-day finalization, missing evidence and revoked digital viewer are denied", async () => {
    const fresh=await counts();
    assert.equal((await POST(req(collector.headers,submit(fresh.source.sourceHash,[fresh.ids[0]],fresh.source.snapshots.at(-1)!.id)))).status,409);
    await digitalCommand(owners[0],{action:"verifier",accountId:accounts[0].id,operatorId:viewer.id,active:false});
    assert.equal((await POST(req(collector.headers,submit(fresh.source.sourceHash,fresh.ids,fresh.source.snapshots.at(-1)!.id)))).status,403);
    await digitalCommand(owners[0],{action:"verifier",accountId:accounts[0].id,operatorId:viewer.id,active:true});
    const today=new Date(Date.now()+8*3600_000).toISOString().slice(0,10); const source=await closingOverview(collector.headers,today);
    const check=await ok(collector.headers,{...countCommand(source.sourceHash,collector.id),day:today});
    assert.equal((await POST(req(collector.headers,{...submit(source.sourceHash,[check.id]),day:today}))).status,409);
  });
});
