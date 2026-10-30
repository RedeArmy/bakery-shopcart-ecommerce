# Technical audit: end of Stage 2

| Field | Value |
|---|---|
| Document ID | QA-AUD-001 |
| Date | 30 October 2026 |
| Scope | Everything built from Stage 0 to Stage 2: repository tooling, CI, Docker, database (migrations, seeds, runner, tSQLt), backend and frontend skeletons |
| Baseline | `main` at commit `6588d97` (pull request #19) |
| Method | Static review of the code, catalogue queries against a migrated SQL Server 2022, dependency audit, execution of every test suite and of the whole compose stack, review of CI and container configuration |
| Result | **Approved to continue to Stage 3** after the fixes in section 4. Seventeen items fixed, eight open and registered in section 5; none of them blocks Delivery Phase 1 |

## 1. Summary

The foundation is sound: the database is built only through versioned scripts, the money rules live in `CHECK` constraints, unique indexes and triggers that are proven by tests on the real tables, and every change goes through a protected branch with ten required checks. The audit found no defect that corrupts data or money. It found one security-relevant dependency problem, one gap in CI that had already let a regression through, and a set of maintainability and operability weaknesses that were cheap to fix now and expensive to fix after Stage 5.

| Dimension | Assessment | Evidence |
|---|---|---|
| Correctness of the data model | Strong | 66 tSQLt tests on the real tables; one design flaw (`GuestToken`) was found by them and fixed before merge |
| Security | Good, with open items | Zero production vulnerabilities after this audit; least-privilege application login proven by test; no CSP at the edge yet (D-02) |
| Reliability | Good | Idempotent runner with a lock, one transaction per script, graceful shutdown now bounded, container hardening |
| Maintainability | Good | Duplicated helpers removed; logic split into pure modules with 98 % to 100 % line coverage in the database tooling |
| Testability | Good for the database, thin elsewhere | Reservation concurrency proven in CI; backend integration tests still missing (D-03) |
| Operability | Good | One command starts the stack, the runner realigns the login, runbook covers the failures seen |
| Documentation | Strong | Controlled migration register, now checked by CI against the files |

## 2. What was verified and holds

1. **Schema from scratch.** Ten migrations and five seeds apply to an empty database, a second run changes nothing, and `db:verify` is clean. The same sequence passes in CI on every pull request.
2. **Money and integrity in the data.** Every decimal is `DECIMAL(18,2)`, no column is floating point or `MONEY`, order totals and VAT are tied by `CHECK`, one open and one approved payment per order is enforced by filtered unique indexes, and the ledgers are insert-only through triggers. Each rule has a test that rejects the invalid input and one that accepts the valid one.
3. **Least privilege.** The application login can run procedures and gets "permission denied" reading a table; rotating its password realigns it.
4. **Drift protection.** An edited migration, a missing file, a migration numbered below an applied one, a changed object without a higher version, and an object edited by hand are all detected, each with a test.
5. **Pipeline.** Ten required checks, linear history, no bypass; SonarCloud quality gate passes; secrets scan clean.
6. **Whole stack.** Built from the Dockerfiles and started: database, runner, backend, frontend and edge all report healthy, with all Linux capabilities dropped.

## 3. Quality indicators

| Indicator | Value |
|---|---|
| Vitest tests | 137 (backend 36, frontend 6 and 1 pending, runner 42, SQL test scripts 24, tooling 28, simulator 1) |
| tSQLt tests | 66, all on the real tables |
| Line coverage, production code | Backend 99 %, runner 99 %, SQL test scripts 100 %, frontend 80 %, tooling 61 % (the command-line entry points are excluded from the SonarCloud figure) |
| Production vulnerabilities | 0 (5 before the audit) |
| Migrations / seeds | 10 / 5, each in the register with its checksum |
| Required checks | 10 |

## 4. Findings fixed in this audit

| ID | Severity | Area | Finding | Fix |
|---|---|---|---|---|
| F-01 | High | Security | `npm audit` reported 5 vulnerabilities in production dependencies: `zod` (memory exhaustion validating oversized collections, a direct risk for an API), the MSAL package pulled in by the SQL driver, and `react-router` (open redirect). | `zod` 4, `react-router-dom` 7, transitive fix. Audit reports zero. Type checks, tests and the frontend build pass |
| F-02 | High | CI | The backend and frontend images stopped building when a workspace was added, and no job builds images, so nobody noticed. | Dockerfiles fixed in #19; new `images` job builds the three Dockerfiles on every pull request |
| F-03 | Medium | Database performance | 41 foreign keys had no index starting with their column. Seven back real queries (payments of an order, images of a product, sales by variant, reservations, movements of an order, ledger entries of a payment). The rest point to tiny reference tables. | Migration `V0010` adds the seven indexes (two filtered); a test checks they exist |
| F-04 | Medium | Database correctness | `UNIQUE` on the nullable `Carts.GuestToken` would have allowed one signed-in cart in the whole table. | Filtered unique index (fixed before merge in #18) |
| F-05 | Medium | Security | Trusting the server certificate was hard-coded to true in three places, including the backend that will run in production. | `DB_TRUST_SERVER_CERTIFICATE`: the backend never trusts by default in production; the runner and the compose file set it explicitly |
| F-06 | Medium | Maintainability | The tSQLt runner duplicated the connection retry, the sequential helper and the batch splitter of the migration runner. | Shared; about 80 lines and a second set of tests removed |
| F-07 | Medium | Correctness | An object removed from the repository stayed alive in the database and `db:verify` could not see it. | `OBJECT_REMOVED` check, with a test |
| F-08 | Medium | Reliability | After `SIGTERM` the server waited for idle keep-alive connections, so a stop could hang until Docker killed it, skipping the pool close; unhandled rejections left the process running in an unknown state. | Idle connections closed, eight-second forced exit, fatal logging and exit on unhandled errors. Verified: the backend stops in about one second |
| F-09 | Low | Security | Containers kept default Linux capabilities and could gain privileges. | `cap_drop: ALL` and `no-new-privileges` on the runner, backend, frontend and edge; the stack was started and is healthy |
| F-10 | Low | Process | Dependabot proposed major upgrades that broke `main` twice and ignored two of the Dockerfiles. | Majors ignored (done by hand with tests), frontend and runner Dockerfiles watched |
| F-11 | Low | Quality | The migration register could drift silently from the files, and the backend coverage figure disagreed with SonarCloud's exclusions. | `sql:lint` now fails when a migration or seed is missing from the register or its checksum differs (this also exercises the CRLF normalisation on Windows); coverage exclusions aligned |
| F-12 | Medium | Operability | `/health/ready` checked the connection only and `REQUIRED_SCHEMA_VERSION` was read but never used, so a backend could take traffic against an outdated schema (was D-01). | `SP_System_GetSchemaVersion` and a readiness check that compares it with a version declared in code; 503 with `schema: outdated` until the migrations run, no version numbers in the response, one log line per state change |
| F-13 | Medium | Database | The collation was the instance default, so unique text and ordering could behave differently per server (was D-04). | `Latin1_General_100_CI_AS_SC` ([ADR-0025](../adr/0025-database-collation.md)), created explicitly, enforced on every run, set on every server the repository starts, and covered by tests |
| F-14 | Low | Process | The `images` job was not a required check (was D-12). | The three `images` contexts are required by the active ruleset, verified live |
| F-15 | Low | Backend | The deadlock retry in the procedure executor had no back-off (was D-09). | Full-jitter exponential delay (25 ms base, 200 ms cap) with injectable `sleep` and `random`, covered by unit tests |
| F-16 | Low | Frontend | `formatMoney` was missing and its test skipped (was D-10). | Implemented from the decimal string without a `number`, rejects anything but two decimals, six tests; frontend branch coverage 75 %, the rest is the entry point `main.tsx` |
| F-17 | Medium | Reliability | A SQL Server started with `MSSQL_COLLATION` accepts connections and then changes its default collation inside the process (about ten seconds); a database created in that window made the server stop with error 3434. It happened while testing Stage 3. A first fix that waited for `msdb` was not enough, because `SERVERPROPERTY('Collation')` already shows the new value when the change starts. | The runner reads the server log and waits until the change has finished or, for a young server that still has another collation, until it has been up for two minutes. The decision is a tested pure function. Verified on fresh containers launching the migration right after they start |

## 5. Debt register (open)

Severity is the impact if it is never addressed; effort is in working hours of one engineer. The target is the stage where the item naturally belongs.

| ID | Severity | Area | Description | Recommended action | Effort | Target |
|---|---|---|---|---|---|---|
| D-02 | Medium | Security | No `Content-Security-Policy` or HSTS on the pages served by the edge (the API has helmet's). | Add CSP and HSTS at the edge, verify in a browser that the app still loads | 3 | Stage 7 |
| D-03 | Medium | Testing | Partly addressed: the anti-oversell guarantee is now proven against a real SQL Server by `npm run sql:concurrency` in the `sql-tests` job. Still missing: tests through the backend (Testcontainers), the idempotency guarantee, and the `integration` job, which is off. | Testcontainers suite for the backend slices; enable the `integration` job and require it | 5 | Stage 4 and 5 |
| D-05 | Medium | Security | Closed in Delivery Phase 1: the idempotency middleware (response stored before it is sent, 5xx frees the key, multipart fingerprint covers the file) and the layered rate limiter run on every route, with the documented policies. The rate limiter keeps its counters in memory: enough for one instance (see the decision log). | Done | 8 | Stage 5 |
| D-06 | Medium | Reliability | The expiry and reconciliation jobs do not exist; reservations would never expire. | Job runner with `sp_getapplock` (design §12.8) | 6 | Stage 6 |
| D-07 | Low | Database | Constraints refer to fixed status identifiers (`IDOrderStatus IN (1, 6)`), coupling migrations to seed values. | Accepted and documented; revisit only if the states change | 0 | none |
| D-08 | Low | Database | Partly addressed: `SP_Idempotency_PurgeExpired` exists. `DdlHistory` and `ReceivedWebhooks` still have no retention policy, and no job runs the purge. | Purge procedures for the other two tables and the job | 2 | Stage 6 |
| D-11 | Low | Dependencies | Major upgrades pending: `mssql` 12, `typescript` 7, `eslint` 10, `vitest` follow-ups, `react` 19. | One pull request per major after Delivery Phase 1 | 8 | after Phase 1 |
| D-14 | Info | Delivery | Demo data (catalogue, coupons, bank account, accounts, performance volume) is postponed to the end; the report execution plans required by the brief depend on it. | Build with enough days left to document the three plans | 8 | Stage 6 |

## 6. Risks for Delivery Phase 1 (Monday 2 November, 23:59)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Stages 3 to 6 do not fit in the remaining days | High | High | Keep one small pull request per block; build the critical procedures first (`ReserveStock`, `CreateOrder`, `ConfirmPayment`) and cut Level 2 features before Level 1 |
| Concurrency guarantees unproven at delivery | Medium | High | D-03 early in Stage 3, not at the end |
| Demo data left too late | Medium | Medium | Reserve a fixed block before the freeze (D-14) |
| Regressions from the speed of delivery | Medium | Medium | The checks that exist now (register, coverage of procedures, image build) turn those into failed pull requests |

## 7. Not verified in this audit

- Behaviour of the stack on Windows with Docker Desktop (only the Windows job of CI and the Linux containers were exercised).
- Content Security Policy and the rendered application in a browser.
- Load or latency figures: there is no dataset to measure against yet.
- The `images` job itself runs for the first time on the pull request that adds it.

## 8. Recommendations

1. Merge this audit's pull request, then add `images` to the required checks.
2. Start Stage 3 with the money function and its tests, then the atomic stock reservation with the concurrency test, because they carry the highest risk.
4. Schedule the demo data (D-14) and the job runner (D-06) as fixed blocks, not as leftovers.
