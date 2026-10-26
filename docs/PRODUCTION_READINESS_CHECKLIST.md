# Production and pilot readiness checklist

**Reconciled:** October 26, 2026 (Asia/Manila), repository baseline `a472cf0`.
**Verdict:** live release and real-data onboarding remain **BLOCKED**. This is an
action plan derived from the [release audit](RELEASE_READINESS_AUDIT.md), its
14-gate R-05 assessment in the [ledger](IMPLEMENTATION_STATUS.md),
[PROJECT §9–10](PROJECT.md#9-decision-register-and-implementation-gates) and
[architecture §3/10/11/14](architecture.md). It is not a new policy approval,
external verification, release certification or authorization to execute the tasks.

S-01–S-03, supported S-04, S-05, S-06 and S-07 have recorded **local synthetic**
acceptance. The latest recorded S-07 checks are 154/154 tests, zero skips, and
typecheck/lint/build/migrations/browser acceptance PASS. These are prior evidence,
not reruns in this reconciliation. The old missing-milestone findings are historical;
they do not require rebuilding delivered workflows. R-04 follow-up stays deferred.

## How to use this checklist

- P0 means decisions needed before dependent implementation or external changes;
  P1 means proof required before a limited live pilot; P2 means actual pilot
  evaluation required before broader rollout. P1 is not optional or lower risk.
- Owners below are **accountable roles to assign**, not named or authorized people.
  Agree one primary, backup where needed, target date and reviewer per item.
- Unchecked means open. `BLOCKED` identifies an unmet decision/control;
  `NOT VERIFIED` identifies missing current evidence. Do not mark an item complete
  until its acceptance evidence is reviewed. A required live gate cannot become
  N/A merely because the current application is synthetic-only.
- Record closure as: item ID, environment, exact revision/deployment, actual check
  date, operator/reviewer, artifact reference, result and limitations. Keep secret
  **names/scopes only** in the packet; no values, raw setup/reset links, cookies,
  banking credentials or real customer evidence in repository logs/documents.
- A bounded staging task may use synthetic data and captured email while live-only
  gates remain open. Explicit staging support must exist first: today's runtime is
  local-only. No checklist item authorizes cloud access, purchases, live email,
  real data, provisioning, secret changes, commits, pushes or deployment.

## P0 — agree ownership, operating policy and scope

- [ ] **PR-01 — Assign delivery and operational authority. BLOCKED.**
  **Owner:** product owner + implementation lead + pilot owner.
  **Action:** assign release approver, platform/bootstrap reviewer, gym owner,
  incident responder/backup, data steward and pilot reviewer; define coverage,
  escalation and authority to stop/reopen financial writes. Approve the bounded
  environment/cost plan before any paid provisioning.
  **Close with:** dated responsibility/backup matrix and approved scope/budget;
  no named role or purchased plan is implied by architecture approval.
  **Trace:** R-05; AD-020/025/028/032; PROJECT §9 stewardship/O-09.

- [ ] **PR-02 — Approve real-data stewardship and evidence custody. BLOCKED.**
  **Owner:** product owner + data steward + pilot owner. **Depends:** PR-01.
  **Action:** settle necessary fields/notices, access and support permissions,
  evidence storage/handling, retention/deletion/archival across member/financial
  records, logs and backups, and breach responsibilities. Obtain appropriate
  privacy review; this checklist makes no legal-compliance conclusion.
  **Close with:** approved stewardship/retention/access procedure and evidence
  location/control design before any real baseline, onboarding or financial data.
  **Trace:** R-05 privacy gate; PROJECT §9 derived stewardship; architecture §10/14.

- [ ] **PR-03 — Approve first-owner and account-recovery SOPs. BLOCKED.**
  **Owner:** platform identity lead + pilot owner. **Depends:** PR-01, PR-02.
  **Action:** specify independent gym-ownership/manual-recovery proof, reviewers,
  private invitation/resend controls, challenged/compromised mailbox and disputed
  ownership handling, safe notifications, session revocation and backup coverage.
  Decide whether exceptional recovery needs two-person review; that recommendation
  is not an approved mandatory rule. Retain exactly one active primary owner and
  private owner/staff passwords.
  **Close with:** signed proof/recovery procedure and an implementation/acceptance
  plan for controlled production bootstrap and recovery-success notice. The
  migration-credential synthetic bootstrap is not a live provisioning mechanism.
  **Trace:** R-05 bootstrap/recovery gates; AD-004–010/014/026/030/032.

- [ ] **PR-04 — Agree supported live workflows and exception treatment. BLOCKED.**
  **Owner:** product owner + pilot owner + operations lead. **Depends:** PR-01.
  **Action:** approve live use of the supported collection, investigation, refund,
  outage and closing procedures. Resolve required affected policies or explicitly
  accept a safe manual escalation process while unsupported commands stay blocked:
  discretionary cancellation terms, uncertain historical cash price/date evidence,
  cross-date digital confirmation and later outage visits. Do not infer refunds,
  re-collection, normal access or backdating from an unresolved claim.
  **Close with:** workflow-by-workflow supported/blocked/manual matrix, accountable
  escalation and user instructions; synchronize any new policy in PROJECT/product
  before implementation. Existing exact full duplicate-excess refunds and zero-money
  corrections remain supported; general cancellation refunds are not implied.
  **Trace:** R-05; PROJECT FR-04/07–10, §8 exception gate, O-02–06.

## P1 — implement and prove the hosted and operating controls

- [ ] **PR-05 — Isolate environments, privileges and actual regions. NOT VERIFIED.**
  **Owner:** implementation/infrastructure lead. **Depends:** PR-01; PR-02 for real data.
  **Action:** prepare separate dev/staging/prod mappings, distinct staging database,
  scoped access/secrets and rotation responsibilities. Verify actual Vercel `sin1`
  and Neon `aws-ap-southeast-1` settings against approved intent, account availability
  and budget; record front-desk latency evidence. Enforce infrastructure-account 2FA.
  **Close with:** dated redacted environment/deployment/region and access matrix,
  proving previews/staging lack production access and the web runtime has no
  migration credentials. Provider settings are externally unverified today.
  **Trace:** R-05 environment/region gates; AD-020/024/025; architecture §11.1–2.

- [ ] **PR-06 — Build explicit staging/live configuration and identity boundaries. BLOCKED.**
  **Owner:** implementation lead. **Depends:** PR-03, PR-04, PR-05 for dependent flows.
  **Action:** scope a separate code task for validated environment/secret/transport
  configuration and controlled live provisioning/recovery paths. Current
  `src/lib/config.ts` requires the isolated local DB, local origin and
  `SYNTHETIC_DATA_ONLY=true`; email/identity/bootstrap paths are synthetic-oriented.
  Keep fail-closed defaults, explicit origins, strict schemas, protected routes and
  enumeration protections. Reconcile architecture's `AUTH_SECRET` wording with the
  implemented `BETTER_AUTH_SECRET` key in an explicit non-secret mapping.
  **Close with:** reviewed implementation and positive/negative tests for correct,
  missing, mixed and forbidden environment configurations, plus server-only secret
  boundaries. Never enable production by deleting guards or changing one flag.
  **Trace:** R-03/05/07; AD-019/025/030/032/033; config/email/identity source.

- [ ] **PR-07 — Establish reproducible CI and gated release/migration controls. NOT VERIFIED.**
  **Owner:** release/implementation lead. **Depends:** PR-05, PR-06 for staging runs.
  **Action:** create/review the release sequence: locked clean install, typecheck,
  lint, real restricted-PostgreSQL tests, build and isolated staging end-to-end
  acceptance; preserve exact command/commit evidence. Separate runtime credentials
  from direct migration-job access, review SQL and require pre-change recovery
  checkpoints. Define approval, stop/smoke checks and application rollback versus
  database recovery; an application rollback does not undo a migration.
  **Close with:** reviewed workflow/runbook and successful controlled staging run;
  before a production release, link PR-11/12 recovery proof to the candidate.
  **Trace:** R-05 ingress/release gate, R-10; architecture CI/CD section.

- [ ] **PR-08 — Verify deployed ingress and abuse controls. BLOCKED.**
  **Owner:** security/implementation lead. **Depends:** PR-05, PR-06, PR-07.
  **Action:** document actual trusted proxy/client-IP handling for the deployed
  ingress, then test spoofed forwarding headers, anonymous floods, actor isolation,
  origin/cookie/session behavior and direct unauthorized endpoints in staging.
  Preserve rate limits and the existing non-local fail-closed guard until a bounded
  implementation supplies the verified contract.
  **Close with:** deployed-revision configuration plus executable denial/abuse
  results; local R-03 actor isolation alone does not close this gate.
  **Trace:** R-03 hosted remainder; R-05 ingress gate; AD-007/019/025.

- [ ] **PR-09 — Prove hosted pooling, RLS and financial invariants. NOT VERIFIED.**
  **Owner:** database/security lead. **Depends:** PR-05, PR-06, PR-07.
  **Action:** run an authorized synthetic staging matrix through the actual pooled
  runtime role and direct migration connection. Check pool bounds, non-owner/
  non-superuser/non-BYPASSRLS roles, FORCE RLS with USING/WITH CHECK, tenant FKs,
  fixed-search-path privileged function ownership/EXECUTE grants, migrations,
  extensions and exclusion/immutable-source constraints. Exercise missing context,
  cross-tenant references, reused connections, rollback, concurrency, same-key lost
  response and revocation across the delivered workflows.
  **Close with:** redacted catalog/grant report and real hosted integration/browser
  results tied to the deployment. Local PostgreSQL PASS is not Neon pool evidence.
  **Trace:** R-05 hosted RLS gate, R-09; AD-009/012/013/016/022/025.

- [ ] **PR-10 — Implement and verify transactional account email. BLOCKED.**
  **Owner:** identity/email lead + platform domain owner.
  **Depends:** PR-02, PR-03, PR-05, PR-06.
  **Action:** obtain current domain/sender ownership evidence; after authorization,
  implement the selected Brevo transport with scoped server-only credentials and
  authenticated domain, environment/recipient isolation and safe delivery handling.
  Verify setup/invitation/reset and required notices, pending-on-failure, authorized
  resend, timeout/rejection/bounce/429/delay and single-use/replay behavior. Review
  current provider eligibility/quotas when executing; old vendor limits are not proof.
  **Close with:** dated domain authentication and sender evidence plus permitted
  staging-recipient end-to-end delivery/failure results. API acceptance is not inbox
  delivery. No domain ownership or live sender is verified by this reconciliation.
  **Trace:** R-05 email gate; AD-027/029–031; architecture Brevo section.

- [ ] **PR-11 — Configure and demonstrate independent recoverable backups. NOT VERIFIED.**
  **Owner:** database/recovery lead. **Depends:** PR-01, PR-02, PR-05.
  **Action:** approve cadence, encrypted independent location, retention/access,
  key rotation, budget and owners. Verify actual plan/history-window settings against
  the approved Launch-or-higher/seven-day-PITR evaluation direction; confirm current
  eligibility before purchase. Prove scheduled backup/checkpoint jobs and failed-job
  detection, with backup audit metadata independent of the primary database.
  **Close with:** dated settings, successful recoverable backup artifacts/job
  catalog and independent storage/access evidence. PITR alone does not cover every
  provider/account-loss scenario; local data files are not an independent backup.
  **Trace:** R-05 backup gate; AD-023/028; architecture recovery section.

- [ ] **PR-12 — Pass isolated restore and financial reconciliation rehearsal. NOT VERIFIED.**
  **Owner:** recovery lead + financial operations owner.
  **Depends:** PR-09, PR-11; coordinate responder/alert procedure with PR-13.
  **Action:** restore synthetic representative data into an isolated target; measure
  unrecoverable confirmed-data gap and incident-to-usable-operation time including
  access reconfiguration and validation. Verify auth, grants/RLS/functions, migrations,
  indexes/extensions, immutable payments/periods/receipts, attribution and legacy
  provenance. Reconcile acknowledgements/cash/paper events after the restore point
  from independently retained evidence without duplicate collections; demonstrate
  write hold and approved reopening.
  **Close with:** repeatable runbook, successful timed drill, source/recovery point,
  reconciliation results and primary/backup/cadence. Demonstrate **RPO ≤1h / RTO ≤4h**;
  unmet targets remain a gate, not an achieved provider SLA. No restore over live data.
  **Trace:** R-05 restore gate; AD-023/028; architecture recovery section.

- [ ] **PR-13 — Demonstrate monitoring, alert response and incident ownership. BLOCKED.**
  **Owner:** operations/security lead + named responder/backup.
  **Depends:** PR-01, PR-02, PR-05, PR-07; recovery alerts link PR-11/12.
  **Action:** configure access/retention and safe correlation for hosted diagnostics;
  define signals, thresholds, coverage and escalation for login/uptime, DB/pool,
  payment failures/retries/rollback, RLS/tenant attempts, entitlement overlaps,
  missing receipt/operation results, delayed verification, email/recovery,
  backup/history-window and deploy/migration failures. Approve restrict/preserve/
  restore/reconcile/reopen and notification procedures.
  **Close with:** dated synthetic alert delivery/acknowledgement and escalation
  drill, safe correlated diagnostics and approved responder/runbook records.
  Local R-10 diagnostics do not demonstrate hosted monitoring or staffed response.
  **Trace:** R-05 monitoring gate; R-10; architecture CI/CD/incident section.

- [ ] **PR-14 — Rehearse staff access lifecycle under approved operating rules. NOT VERIFIED.**
  **Owner:** pilot gym owner + identity lead. **Depends:** PR-03, PR-09, PR-10.
  **Action:** document real staff identity checks, least-privilege capability
  assignment/review, owner-unavailable escalation and prompt offboarding. Rehearse
  invitation, verified mailbox/private password setup, owner-initiated reset,
  revocation and denial of old cookies/credentials/outstanding links in staging.
  **Close with:** signed responsibility/checklist and hosted lifecycle evidence;
  owner email and staff username login remain distinct; no shared credentials.
  **Trace:** R-05 staff lifecycle gate; FR-01; AD-004–008/026/030.

- [ ] **PR-15 — Assign digital-verification and investigation authority. BLOCKED.**
  **Owner:** pilot owner + financial operations lead. **Depends:** PR-02, PR-04, PR-14.
  **Action:** name actual receiving accounts, designated viewers and backups,
  claim/investigation escalation and evidence custodians. Demonstrate verification
  of actual funds independently of a claimant screenshot, owner-only confirmed-
  finance changes, explicit access outcomes and refund approval versus actual
  external settlement. Actual account access or money requires separate authority.
  **Close with:** approved account/viewer/access and evidence-retention matrix plus
  permitted rehearsal/sign-off; every operator uses only their approved capability.
  **Trace:** R-05 operational evidence gates; O-03/04/05; FR-04/07/08.

- [ ] **PR-16 — Perform physical outage/custody and closing rehearsal. BLOCKED.**
  **Owner:** pilot owner + receipt custodians + operations lead.
  **Depends:** PR-02, PR-04, PR-14, PR-15.
  **Action:** adopt the approved [outage](S05_OUTAGE_POLICY_PROPOSAL.md) and
  [closing](S06_CLOSING_POLICY_PROPOSAL.md) SOPs for named live operators: register
  controlled books, exercise used/unused/void/missing leaves and signed shift
  handovers, collector/entrant-independent verification, lost/conflicting receipts,
  prolonged outage and one-visit versus later-visit escalation. Preserve paper
  evidence independently of DB failure. Rehearse original-day recovery, segregated
  cash/counts, unresolved differences and immutable supplemental closings.
  **Close with:** witnessed physical counts/handover and owner/staff exercise
  records, custody/access locations, discrepancy escalation and live SOP sign-off.
  Automated browser success does not prove physical cash/booklet control.
  **Trace:** R-05 receipt/fallback gate; O-02/05/06/09; FR-09/10.

- [ ] **PR-17 — Approve historical-access cutover and live source sign-off. BLOCKED.**
  **Owner:** pilot owner + data steward. **Depends:** PR-02, PR-04, PR-09, PR-14.
  **Action:** apply [approved local legacy rules](S07_LOCAL_POLICY_PROPOSAL.md)
  using an approved live source-custody/review procedure and named authority;
  identify the real cutover, pending/contradictory records and later corrections.
  Preserve exact intervals and actual entry/approval times; no invented collections,
  receipts, sales or receivables. Check duplicates, overlaps and renewal interactions.
  **Close with:** attributable live acceptance/cutover sign-off and exception
  register under approved data access. This task creates no real member records.
  **Trace:** O-08; FR-11 / AC-11a–c; local S-07 is already implemented.

- [ ] **PR-18 — Set the real pilot protocol and train operators. BLOCKED.**
  **Owner:** pilot reviewer + pilot owner + operations lead.
  **Depends:** PR-02, PR-04, PR-14–17 for affected exercises.
  **Action:** agree participants, actual baseline/trial dates/duration/sample scope,
  independent collection sources/coverage, measurement cutoffs, reviewers and weekly
  review. Adopt the [worksheet](S07_MEASUREMENT_WORKSHEET.md) and
  [training/incident checklist](S07_OPERATOR_TRAINING.md); train actual operators and
  record witnessed outcomes, missing observations and follow-ups. Preserve D versus
  D+2, duplicate record versus actual collections, admission exceptions/wrongful
  denials, active-time, shift adoption and shadow-ledger definitions.
  **Close with:** approved real protocol, necessary baseline/coverage plan and
  completed actual training/rehearsal sign-off. Baseline evidence may require a
  separately approved observation period; fictional fixture dates/results are not
  real measurements. Proposed targets remain hypotheses pending pilot agreement.
  **Trace:** R-05 pilot gate; O-09; FR-12 / AC-12a–c; PROJECT §10.

- [ ] **PR-19 — Review the exact candidate and authorize a limited live pilot. BLOCKED.**
  **Owner:** release approver + pilot owner + implementation lead.
  **Depends:** PR-01–18; no required affected live gate may be waived by local PASS.
  **Action:** review fresh checks for the exact candidate, hosted owner/staff
  acceptance, deployment/migration/recovery and monitoring evidence, unresolved
  security/integrity issues, current dependency/advisory/compatibility results and
  the supported/manual scope matrix. Confirm known-user/shift coverage, rollback,
  reconciliation and stop conditions. Apply explicit production/deployment authority
  separately from this documentation task; retain post-release smoke/monitor results.
  **Close with:** dated release/pilot entry decision, exact revision/environment,
  all linked gate evidence and accountable sign-offs. No validated business
  improvement is required to *enter* a properly gated trial; it is required to
  justify broader rollout after evaluation.
  **Trace:** R-05/10; PROJECT §10 definition of done; architecture release sequence.

## P2 — evaluate actual operation before broader rollout

- [ ] **PR-20 — Validate baseline, adoption and business outcomes. NOT VERIFIED.**
  **Owner:** pilot reviewer + pilot owner. **Depends:** PR-18, PR-19.
  **Action:** run the authorized trial and independently review weekly evidence;
  validate the real baseline, collection denominators, discrepancy categories,
  closing work, entry delays, eligibility/admission outcomes, shift adoption and
  unapproved parallel records. Expose outages, missing data and unresolved incidents.
  Assess the agreed targets without manufacturing percentages or improvement.
  **Close with:** reproducible baseline/trial reports, incident dispositions and
  explicit continue/change/stop/broader-rollout decision. A configured deployment
  or synthetic rehearsal cannot establish these outcomes.
  **Trace:** PROJECT §10; FR-12; O-09; R-05 pilot evidence.

## Audit coverage and deferred work

| Original R-05 gate | Actionable item(s) |
|---|---|
| Environment/credential separation | PR-05, PR-06, PR-07 |
| Actual hosting/database region | PR-05 |
| Hosted pooling/roles/RLS | PR-09 |
| Deployment ingress/release controls | PR-06, PR-07, PR-08, PR-19 |
| Domain/sender/transactional delivery | PR-10 |
| First-owner verification | PR-03, PR-06 |
| Owner/staff recovery | PR-03, PR-06, PR-10, PR-14 |
| Staff onboarding/offboarding | PR-14 |
| Backup/PITR/independent copies | PR-11 |
| Isolated restore/RPO/RTO | PR-12 |
| Logging/alerts/incidents | PR-01, PR-13 |
| Privacy/retention | PR-02 |
| Receipt/evidence custody/fallback | PR-02, PR-04, PR-15, PR-16 |
| Pilot operating procedures/approvals | PR-04, PR-15–20 |

R-01/02/06/07/08/09 and the local R-03/R-10 repairs have recorded local evidence;
their hosted regression proof belongs in PR-07–09/19, rather than reopening the
original repaired defects as if still reproduced. R-04 follow-up remains **DEFERRED**.
R-11's historical ESLint maintenance warning and the recorded pg concurrent-query
deprecation need bounded diagnosis/compatibility work; they are not, by themselves,
new demonstrated vulnerabilities. Current material security findings from PR-19's
review must be resolved or escalated under the controlling acceptance rules.

**Recommended next task after the GitHub checkpoint:** one bounded documentation
decision packet for PR-01–04, including owners/backup coverage, stewardship,
bootstrap/recovery proof and the supported/manual live scope; assign dates and
approve a synthetic staging verification plan. Stop before implementation or any
external action until that scope is explicitly authorized. Independent document
drafting can proceed while dependent live work remains blocked.
