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
import { prepareCharge, confirmCash } from "../src/lib/charges";
import { assessEligibility } from "../src/lib/eligibility";
import { legacyCommand, LegacyRejected } from "../src/lib/legacy";
import { legacyCommandSchema, legacyInterval } from "../src/lib/legacy-schema";
import { pilotEvidence, pilotWindowSchema } from "../src/lib/pilot";
import { closingOverview } from "../src/lib/closing";
import { POST } from "../src/app/api/legacy/route";

assertSynthetic();
for (const key of ["DATABASE_URL","MIGRATION_DATABASE_URL"]) {
  const url = new URL(process.env[key]!); assert.equal(url.hostname,"127.0.0.1"); assert.equal(url.port,"55432"); assert.equal(url.pathname,"/gym_crm_synthetic");
}
assert.equal(process.env.BETTER_AUTH_URL,"http://127.0.0.1:3000");
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC" }) });
after(async () => { await db.$disconnect(); await admin.$disconnect(); });
const password = "Synthetic Legacy Password 2026!"; const suffix = randomUUID().slice(0,8);
let token = ""; const sender: EmailSender = { async send(message) { token = new URL(message.url).hash.slice(1); } };
async function login(identifier: string, mode = "email") {
  const response = await auth.handler(new Request(`http://127.0.0.1:3000/api/auth/sign-in/${mode}`, { method:"POST", headers:{origin:"http://127.0.0.1:3000","content-type":"application/json"}, body:JSON.stringify({[mode]:identifier,password}) }));
  assert.equal(response.status,200); return new Headers({cookie:response.headers.getSetCookie().map(c => c.split(";")[0]).join("; ")});
}
async function request(headers: Headers, body: object, key = randomUUID()) {
  const h=new Headers(headers); h.set("origin","http://127.0.0.1:3000"); h.set("content-type","application/json"); h.set("idempotency-key",key);
  return POST(new Request("http://127.0.0.1:3000/api/legacy",{method:"POST",headers:h,body:JSON.stringify(body)}));
}
test("S-07 interval interpretation and strict boundaries", () => {
  const interval=legacyInterval("VALID_THROUGH_DATES","2024-02-28","2024-02-29")!;
  assert.equal(interval.startsAt.toISOString(),"2024-02-27T16:00:00.000Z"); assert.equal(interval.endsAt.toISOString(),"2024-02-29T16:00:00.000Z");
  assert.equal(legacyInterval("VALID_THROUGH_DATES","2026-02-29","2026-03-01"),null);
  assert.equal(legacyInterval("INSTANTS","2026-10-01T00:00:00","2026-10-02T00:00:00"),null);
  assert.equal(legacyInterval("INSTANTS","2026-10-01T00:00:00Z","2026-10-01T00:00:00Z"),null);
  assert.equal(legacyInterval("INSTANTS","2026-10-01T00:00:00.1234Z","2026-10-02T00:00:00Z"),null);
  assert.equal(legacyInterval("VALID_THROUGH_DATES","0000-01-01","2026-10-01"),null);
  assert.equal(pilotWindowSchema.safeParse({start:"2026-10-01",end:"2026-10-15"}).success,true);
  for(const value of [{start:["2026-10-01"],end:"2026-10-15"},{start:"2026-10-01",end:"2026-12-01"},{start:"2026-10-15",end:"2026-10-01"}]) assert.equal(pilotWindowSchema.safeParse(value).success,false);
});
test("S-07 real PostgreSQL reviewed legacy access and purchase isolation", async t => {
  t.beforeEach(async()=>{await admin.rateLimit.deleteMany();}); await admin.rateLimit.deleteMany();
  const gyms=[randomUUID(),randomUUID()]; const owners: Headers[]=[];
  for(const [i,gymId] of gyms.entries()) {
    const email=`legacy-owner-${i}-${suffix}@example.test`;
    await bootstrapSyntheticOwner({gymId,gymName:`Synthetic Legacy ${i}`,email,name:"Synthetic Legacy Owner"},sender,admin);
    await completeSetup(token,password); const h=await login(email); await reauthenticate(h,password); owners.push(h);
  }
  const owner=await admin.operator.findFirstOrThrow({where:{gymId:gyms[0],role:"OWNER"}});
  const username=`legacy_staff_${suffix}`;
  await inviteStaff(owners[0],{name:"Synthetic Legacy Staff",username,email:`${username}@example.test`},sender);
  await completeSetup(token,password); const staff=await login(username,"username");
  const operator=await admin.operator.findFirstOrThrow({where:{gymId:gyms[0],user:{username}}});
  await setCapabilities(owners[0],operator.id,{canManageMembers:true,canCollectCash:true});
  await changePlans(owners[0],{action:"initialize"});
  const now=new Date(); const start=new Date(now.getTime()-10*86400_000).toISOString(); const end=new Date(now.getTime()+10*86400_000).toISOString();
  async function proposal(patch: object={}) {
    const member=await createMember(staff,{fullName:`Synthetic Historical ${randomUUID().slice(0,8)}`});
    const command={action:"prepare",memberId:member.id,previousId:null,sourceReference:`REGISTER-${randomUUID()}`,sourceType:"GYM_REGISTER",corroboratingReference:`CARD-${randomUUID()}`,
      interpretation:"INSTANTS",claimedStart:start,claimedEnd:end,uncertainty:"CERTAIN",notes:"Independent fictional register and card inspected",...patch};
    const row=await legacyCommand(staff,command,randomUUID()); return {member,command,row};
  }
  const review=(proposalId:string,decision="APPROVE")=>({action:"review",proposalId,decision,independentlyChecked:true,notes:"Owner independently checked both fictional originals"});
  await t.test("staff may prepare but cannot approve; anonymous, cross-gym and protected mutations denied",async()=>{
    const p=await proposal();
    for(const [h,status] of [[staff,403],[new Headers(),401],[owners[1],404]] as const) assert.equal((await request(h,review(p.row.id))).status,status);
    for(const patch of [{gymId:gyms[1]},{actorId:owner.id},{createdAt:new Date().toISOString()},{paymentId:randomUUID()},{startsAt:end},{amount:800}]) {
      assert.equal(legacyCommandSchema.safeParse({...p.command,...patch}).success,false);
      assert.equal((await request(staff,{...p.command,...patch})).status,400);
    }
    const other=await createMember(owners[1],{fullName:"Synthetic Other Gym Member"});
    assert.equal((await request(staff,{...p.command,memberId:other.id})).status,404);
    assert.equal((await request(owners[0],{...review(p.row.id),independentlyChecked:false})).status,400);
    assert.equal(await admin.effectiveEntitlement.count({where:{memberId:p.member.id}}),0);
  });
  await t.test("approval is atomic, preserves provenance and creates no collections or closing changes",async()=>{
    const p=await proposal(); const day=new Date(Date.now()+8*3600_000).toISOString().slice(0,10);
    const before=await closingOverview(owners[0],day);
    const counts=await Promise.all([admin.payment.count({where:{gymId:gyms[0]}}),admin.charge.count({where:{gymId:gyms[0]}}),admin.paymentReceipt.count({where:{gymId:gyms[0]}})]);
    const entered=p.row.createdAt; const key=randomUUID(); const approved=await legacyCommand(owners[0],review(p.row.id),key);
    assert.equal(approved.proposalId,p.row.id); assert(approved.createdAt>=entered); assert.equal(approved.actorId,owner.id);
    const intervals=await admin.effectiveEntitlement.findMany({where:{memberId:p.member.id}});
    assert.equal(intervals.length,1); assert.equal(intervals[0].periodId,null); assert.equal(intervals[0].legacyRecordId,approved.id);
    assert.equal(assessEligibility(intervals,new Date(start)).status,"ELIGIBLE");
    assert.equal(assessEligibility(intervals,new Date(end)).status,"EXPIRED");
    assert.equal(assessEligibility(intervals,new Date(new Date(start).getTime()-1)).status,"SCHEDULED");
    assert.deepEqual(await Promise.all([admin.payment.count({where:{gymId:gyms[0]}}),admin.charge.count({where:{gymId:gyms[0]}}),admin.paymentReceipt.count({where:{gymId:gyms[0]}})]),counts);
    assert.equal((await closingOverview(owners[0],day)).sourceHash,before.sourceHash);
    assert.equal((await legacyCommand(owners[0],review(p.row.id),key)).id,approved.id);
    assert.equal((await request(owners[0],{...review(p.row.id),notes:"Changed fingerprint"},key)).status,409);
    const report=await pilotEvidence(staff,{start:day,end:new Date(new Date(`${day}T00:00Z`).getTime()+86400_000).toISOString().slice(0,10)});
    assert(report.legacy.some(r=>r.id===approved.id)); assert.equal(report.payments.length,0);
    assert(!(await pilotEvidence(owners[1],{start:day,end:new Date(new Date(`${day}T00:00Z`).getTime()+86400_000).toISOString().slice(0,10)})).legacy.some(r=>r.id===approved.id));
    await assert.rejects(pilotEvidence(new Headers(),{start:day,end:new Date(new Date(`${day}T00:00Z`).getTime()+86400_000).toISOString().slice(0,10)}));
    await assert.rejects(admin.legacyRecord.update({where:{id:approved.id},data:{notes:"overwrite"}}));
    await assert.rejects(admin.legacyRecord.delete({where:{id:p.row.id}}));
    await assert.rejects(admin.effectiveEntitlement.update({where:{id:intervals[0].id},data:{endsAt:new Date(now.getTime()+20*86400_000)}}));
  });
  await t.test("uncertainty remains flagged and does not revoke other verified access",async()=>{
    const p=await proposal(); await legacyCommand(owners[0],review(p.row.id),randomUUID());
    for(const uncertainty of ["CONFLICTING_EXPIRY","UNSUPPORTED_PAYMENT","UNPAID_BALANCE","AMBIGUOUS_INTERVAL"]) {
      const uncertain=await proposal({memberId:p.member.id,uncertainty,claimedStart:null,claimedEnd:null,corroboratingReference:null,previousId:p.row.id});
      assert.equal((await request(owners[0],review(uncertain.row.id))).status,409);
      await legacyCommand(owners[0],review(uncertain.row.id,"FLAG"),randomUUID());
    }
    assert.equal(assessEligibility(await admin.effectiveEntitlement.findMany({where:{memberId:p.member.id}}),new Date()).status,"ELIGIBLE");
    assert.equal(await admin.payment.count({where:{memberId:p.member.id}}),0);
  });
  await t.test("source duplicates, overlaps, concurrent approval and renewed purchases retain sequencing",async()=>{
    const p=await proposal(); const keys=[randomUUID(),randomUUID()];
    const results=await Promise.all(keys.map(key=>request(owners[0],review(p.row.id),key))); assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    const repeatedKey=randomUUID(); const q=await proposal(); const repeated=await Promise.all([legacyCommand(owners[0],review(q.row.id),repeatedKey),legacyCommand(owners[0],review(q.row.id),repeatedKey)]);
    assert.equal(repeated[0].id,repeated[1].id);
    const duplicate=await proposal({sourceReference:p.row.sourceReference}); assert.equal((await request(owners[0],review(duplicate.row.id))).status,409);
    const swapped=await proposal({sourceReference:p.row.corroboratingReference,corroboratingReference:p.row.sourceReference});
    assert.equal((await request(owners[0],review(swapped.row.id))).status,409);
    await assert.rejects(inGym(owners[0],"MEMBERS",async tx=>{
      const approved=await tx.legacyRecord.create({data:{...swapped.row,id:randomUUID(),kind:"APPROVE",proposalId:swapped.row.id,actorId:owner.id,operationKey:randomUUID(),createdAt:new Date()}});
      await tx.effectiveEntitlement.create({data:{gymId:gyms[0],memberId:swapped.row.memberId,legacyRecordId:approved.id,startsAt:approved.startsAt!,endsAt:approved.endsAt!}});
    },true));
    const overlap=await proposal({memberId:p.member.id}); assert.equal((await request(owners[0],review(overlap.row.id))).status,409);
    assert.equal(await admin.identityAudit.count({where:{subjectId:overlap.row.id,action:{startsWith:"LEGACY_APPROVAL_BLOCKED"}}}),1);
    // Bypass application preflight: the all-source PostgreSQL exclusion is still decisive.
    await assert.rejects(inGym(owners[0],"MEMBERS",async tx=>{
      const approved=await tx.legacyRecord.create({data:{...overlap.row,id:randomUUID(),kind:"APPROVE",proposalId:overlap.row.id,actorId:owner.id,operationKey:randomUUID(),createdAt:new Date()}});
      await tx.effectiveEntitlement.create({data:{gymId:gyms[0],memberId:p.member.id,legacyRecordId:approved.id,startsAt:approved.startsAt!,endsAt:approved.endsAt!}});
    },true));
    const plan=await admin.plan.findFirstOrThrow({where:{gymId:gyms[0],durationDays:30}});
    const charge=await prepareCharge(staff,p.member.id,plan.id); assert.equal(charge.intendedStart.toISOString(),end);
    const paid=await confirmCash(staff,charge.id,"800",randomUUID()); assert.equal(paid.period.startsAt.toISOString(),end);
    await assert.rejects(prepareCharge(staff,p.member.id,plan.id),/future paid period/);
    const paidBefore=await admin.membershipPeriod.findUniqueOrThrow({where:{id:paid.period.id}});
    const againstPaid=await proposal({memberId:p.member.id,claimedEnd:new Date(new Date(end).getTime()+86400_000).toISOString()});
    assert.equal((await request(owners[0],review(againstPaid.row.id))).status,409);
    assert.deepEqual(await admin.membershipPeriod.findUniqueOrThrow({where:{id:paid.period.id}}),paidBefore);
  });
  await t.test("legacy approval versus cash confirmation cannot resequence a reviewed purchase silently",async()=>{
    const p=await proposal(); const plan=await admin.plan.findFirstOrThrow({where:{gymId:gyms[0],durationDays:30}});
    const charge=await prepareCharge(staff,p.member.id,plan.id);
    const results=await Promise.allSettled([legacyCommand(owners[0],review(p.row.id),randomUUID()),confirmCash(staff,charge.id,"800",randomUUID())]);
    assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
    assert.equal(await admin.effectiveEntitlement.count({where:{memberId:p.member.id}}),1);
  });
  await t.test("fresh owner required; rollback, missing RLS context, tenant FKs and source guards",async()=>{
    const p=await proposal(); const session=await auth.api.getSession({headers:owners[0]});
    await admin.session.update({where:{id:session!.session.id},data:{reauthenticatedAt:new Date(0)}});
    assert.equal((await request(owners[0],review(p.row.id))).status,403); await reauthenticate(owners[0],password);
    const before=await admin.legacyRecord.count({where:{gymId:gyms[0]}});
    await assert.rejects(inGym(owners[0],"MEMBERS",async(tx)=>{
      const row=await tx.legacyRecord.create({data:{gymId:gyms[0],memberId:p.member.id,kind:"APPROVE",proposalId:p.row.id,sourceReference:p.row.sourceReference,sourceType:p.row.sourceType,
        corroboratingReference:p.row.corroboratingReference,interpretation:p.row.interpretation,claimedStart:p.row.claimedStart,claimedEnd:p.row.claimedEnd,startsAt:p.row.startsAt,endsAt:p.row.endsAt,
        uncertainty:"CERTAIN",notes:"Synthetic injected failure",actorId:owner.id,operationKey:randomUUID(),fingerprint:"a".repeat(64)}});
      await tx.effectiveEntitlement.create({data:{gymId:gyms[0],memberId:p.member.id,legacyRecordId:row.id,startsAt:row.startsAt!,endsAt:row.endsAt!}});
      throw new Error("Synthetic rollback after projection");
    },true),/Synthetic rollback/);
    assert.equal(await admin.legacyRecord.count({where:{gymId:gyms[0]}}),before); assert.equal(await admin.effectiveEntitlement.count({where:{memberId:p.member.id}}),0);
    await assert.rejects(inGym(owners[0],"MEMBERS",tx=>tx.legacyRecord.create({data:{...p.row,id:randomUUID(),kind:"APPROVE",proposalId:p.row.id,actorId:owner.id,operationKey:randomUUID(),createdAt:new Date()}})),"approval without projection must fail at commit");
    await assert.rejects(inGym(owners[0],"MEMBERS",tx=>tx.effectiveEntitlement.create({data:{gymId:gyms[0],memberId:p.member.id,legacyRecordId:p.row.id,startsAt:new Date(start),endsAt:new Date(end)}})));
    await assert.rejects(db.legacyRecord.create({data:{...p.row,id:randomUUID(),operationKey:randomUUID()}}));
    await assert.rejects(db.$transaction(async tx=>{await setGymContext(tx,gyms[1]); return tx.legacyRecord.create({data:{...p.row,id:randomUUID(),gymId:gyms[1],operationKey:randomUUID()}});}));
    await db.$transaction(async tx=>{ assert.equal(await tx.legacyRecord.count(),0); });
    await db.$transaction(async tx=>{await setGymContext(tx,gyms[1]); assert.equal(await tx.legacyRecord.count({where:{gymId:gyms[0]}}),0);});
    const role=await db.$queryRaw<{rolsuper:boolean;rolbypassrls:boolean}[]>`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`; assert.equal(role[0].rolsuper,false); assert.equal(role[0].rolbypassrls,false);
    // No normal purchase can drop its mandatory confirmed payment provenance.
    await assert.rejects(admin.$executeRaw`INSERT INTO membership_periods(id,gym_id,member_id,payment_id,confirmed_by,starts_at,ends_at) VALUES(${randomUUID()}::uuid,${gyms[0]}::uuid,${p.member.id}::uuid,NULL,${owner.id}::uuid,${new Date(start)},${new Date(end)})`);
    assert(LegacyRejected.prototype instanceof Error);
  });
});
