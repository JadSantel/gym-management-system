import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Check the published manual worksheet against its independent fixed source fixture.
// This is artifact verification, not a production analytics engine or real pilot data.
const fixture = JSON.parse(readFileSync(new URL("../docs/fixtures/s07-measurement.json",import.meta.url),"utf8")) as {
  synthetic:boolean; window:{start:string;end:string;complete:boolean};
  independentSources:{id:string;kind:string;actualEvent:string;amountCentavos?:number}[];
  collections:{id:string;sources:string[];method:string;amountCentavos:number;collectedAt:string;enteredAt:string|null;verifiedAt:string;paperIssuedAt:string|null;interactionStart:string|null;interactionEnd:string|null;observation:string|null;offline:boolean;crmRecords:string[]}[];
  incidents:{id:string;category:string;collections:string[];state:string}[];
  changes:{kind:string;amountCentavos:number;approvedAt?:string;settledAt?:string;settlementMethod?:string;originalMethod?:string}[];
  closingSegments:{operator:string;start:string;end:string;active:boolean;phase:string}[];
  eligibilitySamples:{id:string;seconds:number|null;failure:boolean}[];
  admissions:{id:string;category:string}[];admissionCoverageComplete:boolean;
  operatorShifts:{shift:string;operator:string;applicable:boolean;used:boolean|null;source:string|null}[];
  parallelRecords:{id:string;authorizedOutage:boolean}[];legacy:{classification:string}[];baselineObservations:null;
};
const instant=(value:string)=>new Date(value).getTime();
const day=(value:string)=>new Date(instant(value)+8*3_600_000).toISOString().slice(0,10);
const inWindow=fixture.collections.filter(c=>instant(c.collectedAt)>=instant(fixture.window.start)&&instant(c.collectedAt)<instant(fixture.window.end));
function rate(numerator:number|null,denominator:number|null,complete=true) {
  if(!complete||numerator===null||denominator===null) return "UNKNOWN";
  if(denominator===0) return "N/A (zero denominator)";
  assert(numerator>=0&&numerator<=denominator);
  return `${(100*numerator/denominator).toFixed(2)}%`;
}
test("S-07 worksheet independent source count, classifications and cutoffs",()=>{
  assert.equal(fixture.synthetic,true); assert.equal(fixture.window.complete,true);
  assert.deepEqual(inWindow.map(c=>c.id),["C1","C2","C3"]);
  assert.equal(new Set(inWindow.map(c=>c.id)).size,3);
  for(const c of inWindow) {
    const sources=fixture.independentSources.filter(s=>c.sources.includes(s.id)); assert.equal(sources.length,c.sources.length);
    assert(sources.every(s=>s.actualEvent===c.id));
    const independentlyCounted=sources.filter(s=>s.amountCentavos!==undefined);
    assert.equal(independentlyCounted.length,1); assert.equal(independentlyCounted[0].amountCentavos,c.amountCentavos);
  }
  assert.equal(inWindow.flatMap(c=>c.crmRecords).length,4);
  const gross=inWindow.reduce((sum,c)=>sum+c.amountCentavos*c.crmRecords.length,0);
  assert.equal(gross,320000); assert.equal(inWindow.reduce((sum,c)=>sum+c.amountCentavos,0),240000);
  assert.equal(gross-fixture.changes.filter(c=>c.kind==="EXECUTED_FALSE_RECORD").reduce((sum,c)=>sum+c.amountCentavos,0),240000);
  assert.deepEqual(fixture.legacy.map(l=>l.classification),["HISTORICAL_ENTITLEMENT","LEGACY_EXCEPTION"]);
  assert.equal(fixture.baselineObservations,null);
  assert.equal(rate(null,null),"UNKNOWN"); assert.equal(rate(0,0),"N/A (zero denominator)");
  assert.equal(rate(2,3,false),"UNKNOWN"); // Known subtotal 3 is not complete evidence.
});
test("S-07 D/D+2 entry is delayed despite on-day paper; recovery and payout are not new collections",()=>{
  const c=inWindow[0];
  assert.equal((instant(c.enteredAt!)-instant(c.collectedAt))/3_600_000,48);
  assert.equal((instant(c.verifiedAt)-instant(c.collectedAt))/3_600_000,49);
  assert.equal(rate(inWindow.filter(c=>c.enteredAt&&day(c.enteredAt)===day(c.collectedAt)).length,3),"66.67%");
  const paper=inWindow.filter(c=>c.paperIssuedAt!==null);
  assert.equal(rate(paper.filter(c=>day(c.paperIssuedAt!)===day(c.collectedAt)).length,paper.length),"100.00%");
  assert.equal(fixture.collections.filter(c=>day(c.enteredAt!)==="2026-10-05").length,2);
  assert(!inWindow.some(c=>c.id==="OLD"));
  const refund=fixture.changes.find(c=>c.kind==="REFUND")!;
  assert.equal(refund.originalMethod,"BANK"); assert.equal(refund.settlementMethod,"CASH");
  const payoutAt=(asOf:string)=>refund.settledAt&&instant(refund.settledAt)<=instant(asOf)?refund.amountCentavos:0;
  assert.equal(payoutAt(refund.approvedAt!),0); assert.equal(payoutAt(refund.settledAt!),80000);
  assert.equal(inWindow.length,3); // Settled excess remains a real original collection.
  const observed=inWindow.filter(c=>c.observation&&c.interactionStart&&c.interactionEnd);
  assert.equal(observed.length,3);
  assert.equal(rate(observed.filter(c=>c.enteredAt&&instant(c.enteredAt)>=instant(c.interactionStart!)&&instant(c.enteredAt)<=instant(c.interactionEnd!)).length,3),"66.67%");
  assert.equal(rate(inWindow.filter(c=>c.offline).length,3),"33.33%");
  assert.equal(rate(null,3),"UNKNOWN"); // Unknown entry/interaction is not a failed/zero observation.
});
test("S-07 categorized incidents, unlinked claims and unique affected collections",()=>{
  for(const category of ["RECORDING_DELAY","DUPLICATE_RECORD","DUPLICATE_COLLECTION"]) {
    const rows=fixture.incidents.filter(i=>i.category===category);
    assert.equal(new Set(rows.map(i=>i.id)).size,1);
    assert.equal(rate(new Set(rows.flatMap(i=>i.collections)).size,3),"33.33%");
  }
  for(const category of ["MISSING_ENTRY","WRONG_AMOUNT"]) assert.equal(fixture.incidents.filter(i=>i.category===category).length,0);
  const disputed=fixture.incidents.filter(i=>i.category==="DISPUTED_CLAIM"); assert.equal(disputed.length,1); assert.equal(disputed[0].collections.length,0); assert.equal(disputed[0].state,"OPEN");
  assert.equal(new Set(fixture.incidents.flatMap(i=>i.collections)).size,3);
  // A missing-entry and wrong-amount incident on C1 add categories, not collections.
  const variant=[...fixture.incidents,{id:"MISSING",category:"MISSING_ENTRY",collections:["C1"],state:"OPEN"},{id:"WRONG",category:"WRONG_AMOUNT",collections:["C1"],state:"OPEN"}];
  assert.equal(new Set(variant.flatMap(i=>i.collections)).size,3);
  assert.equal(rate(1,3),"33.33%");
});
test("S-07 closing person-minutes, untimed eligibility failures, admission coverage and shift adoption",()=>{
  const active=fixture.closingSegments.filter(s=>s.active);
  for(const op of new Set(active.map(s=>s.operator))) {
    const segments=active.filter(s=>s.operator===op).sort((a,b)=>instant(a.start)-instant(b.start));
    segments.forEach((s,i)=>{assert(instant(s.end)>instant(s.start)); if(i)assert(instant(s.start)>=instant(segments[i-1].end));});
  }
  assert.equal(active.reduce((sum,s)=>sum+instant(s.end)-instant(s.start),0)/60000,35);
  const original=active.filter(s=>s.phase==="ORIGINAL");
  assert.equal((Math.max(...original.map(s=>instant(s.end)))-Math.min(...original.map(s=>instant(s.start))))/60000,30);
  const timed=fixture.eligibilitySamples.flatMap(s=>s.seconds===null?[]:[s.seconds]).sort((a,b)=>a-b);
  assert.deepEqual(timed,[8,12,20]); assert.equal(timed[1],12); assert.equal(fixture.eligibilitySamples.filter(s=>s.seconds===null&&s.failure).length,1);
  assert.equal(new Set(fixture.admissions.map(a=>a.category)).size,5); assert.equal(fixture.admissionCoverageComplete,false);
  assert.equal(rate(1,null),"UNKNOWN");
  const pairs=fixture.operatorShifts.filter(s=>s.applicable); assert.equal(pairs.length,3); assert(pairs.every(s=>s.source&&s.used!==null));
  assert.equal(rate(pairs.filter(s=>s.used).length,pairs.length),"66.67%");
  const shifts=[...new Set(pairs.map(s=>s.shift))]; assert.equal(rate(shifts.filter(shift=>pairs.filter(s=>s.shift===shift).every(s=>s.used)).length,shifts.length),"50.00%");
  assert.equal(fixture.parallelRecords.filter(p=>!p.authorizedOutage).length,1); assert.equal(fixture.parallelRecords.filter(p=>p.authorizedOutage).length,1);
  assert.equal(rate(null,pairs.length),"UNKNOWN"); // An unobserved shift is not observed non-use.
});
