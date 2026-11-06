# Technical audit

The file keeps its original name so that existing links work. It is a living document: each revision lists what was fixed and what was found.

| Field | Value |
|---|---|
| Document ID | QA-AUD-001 |
| Revision 1 | 30 October 2026, end of Stage 2 (baseline `main` at `6588d97`, pull request #19) |
| Revision 2 | 5 November 2026, Delivery Phase 1 complete (baseline `main` at `a446f5a`, pull request #44) |
| Scope of revision 2 | The whole delivered system: database (migrations, objects, seeds, runner, tSQLt), backend (modules, platform, security), API contract, CI, containers, documentation and the frontend skeleton |
| Method | Static review of the code and the SQL, execution of the unit tests and of the architecture rules, dependency audit and outdated check, review of the CI results of the open pull request, comparison of every figure in the documents with the repository |
| Result | **Delivery Phase 1 scope approved to move to Phase 2.** One high finding is open and has a ready fix (D-15: merge pull request #45). Thirty-five items fixed in total, sixteen open (section 5) and eight anticipated (section 6) |

## 1. Summary

The data model, the money rules and the concurrency guarantees are sound and are proven by tests against a real SQL Server. Since revision 1 the system went from a database skeleton to the complete database and backend: 83 procedures, 73 API operations, idempotency, layered rate limiting, background jobs, a dashboard and an independent database review. The audit found no defect that corrupts data or money.

What it found is concentrated in four places: one vulnerable production dependency that CI cannot detect, configuration and documentation that describe more than what is built (card payments, shipping, observability), the `integration` job that is still switched off, and decisions that the frontend needs before it starts (where to keep the refresh token, how to generate the API client).

| Dimension | Assessment | Evidence |
|---|---|---|
| Correctness of the data model | Strong | 537 tSQLt tests on the real tables; reconciliation views return zero rows after every scenario; a mutation check on the last-unit return closing and on the ownership condition is caught |
| Money | Strong | `DECIMAL(18,2)` everywhere, integer cents in calculations, half-even implemented once in SQL and once in TypeScript with shared test vectors |
| Concurrency | Strong | 16 scenarios with real connections (100 buyers for 1 unit give exactly 1 success); two deadlocks found and fixed |
| Security | Good, one high finding | Least privilege proven by test, IDOR answers 404, uploads checked by bytes with opaque keys; `multer` has known denial-of-service advisories (D-15) |
| Reliability | Good | Idempotent runner, fail-closed start-up gate, jobs behind application locks, bounded shutdown; the connection pool has no error listener (D-19) |
| Performance | Good | Measured with 50,000 orders: the heaviest list went from 483,437 reads to 767; `npm run sql:bench` guards it |
| Testability | Good, with a gap in CI | 17 HTTP flows exist but the `integration` job is off (D-03) |
| Maintainability | Good | Hexagonal rules enforced by `dependency-cruiser` (96 modules, 345 dependencies, no violation, and the self-test detects deliberate violations) |
| Documentation | Good, with drift | Strong coverage, but some statements describe what is not built (D-20) and some figures are stale (D-21) |

## 2. What was verified and holds

1. **Rules of the architecture.** `npm run arch:check` passes: no violation in 96 modules and 345 dependencies, and the four deliberate violations of the self-test are detected.
2. **Unit tests.** 561 pass (backend 331, frontend 18, and 212 across the runner, the SQL test scripts, the tooling and the simulator).
3. **Inventory of the build.** 12 migrations, 6 seeds, 83 procedures, 17 functions, 6 views, 73 API operations, 537 tSQLt tests and 17 HTTP flows. The OpenAPI contract has the same 73 operations as the routes, and a test keeps it that way.
4. **Database tests in CI.** The `sql-tests` job (tSQLt, concurrency, procedure coverage) and the other required checks pass on the open pull request #45.
5. **Delivery check.** The Postman collection (38 requests, 66 assertions, English and Spanish) was run with `newman` against a fresh stack on 2 November: 0 failed.
6. **Security controls present in the code.** Helmet and strict CORS; zod at every boundary with a 100 kb JSON limit; access token HS256 with algorithm, issuer and expiry checked; refresh tokens opaque, rotated and revoked as a family on reuse; Argon2id passwords; proofs validated by magic bytes, stored under UUID keys with `wx` and mode `0600`; the application login without table permissions; pino redaction; edge limits on the authentication routes; `trust proxy` set to one hop with `X-Forwarded-For` overwritten by nginx.
7. **Database discipline.** No `NOLOCK`, no cursors, no dynamic SQL in the objects, no legacy types (`DATETIME`, `MONEY`, `FLOAT`, `TEXT`), no cascading deletes, `SET XACT_ABORT ON` in every procedure that writes, typed parameters.

## 3. Quality indicators

| Indicator | Value |
|---|---|
| Vitest tests | 561 |
| tSQLt tests | 537, all on the real tables |
| Concurrency scenarios / HTTP flows | 16 / 17 |
| Procedure coverage by tSQLt | 83 of 83 |
| Production vulnerabilities | 1 high (`multer`, 9 advisories); fix in pull request #45 |
| Development-only vulnerabilities | 7 moderate (`typescript-eslint` and `minimatch`, no runtime exposure) |
| Line coverage | Not re-measured in revision 2; the SonarCloud quality gate passes on pull request #45 |
| Debt | 16 open, 8 anticipated, 35 fixed |

## 4. Findings fixed

### 4.1 Revision 1 (30 October)

| ID | Severity | Area | Finding | Fix |
|---|---|---|---|---|
| F-01 | High | Security | `npm audit` reported 5 vulnerabilities in production dependencies: `zod` (memory exhaustion), the MSAL package pulled in by the SQL driver, and `react-router` (open redirect). | `zod` 4, `react-router-dom` 7, transitive fix. Audit reported zero at that date |
| F-02 | High | CI | The backend and frontend images stopped building when a workspace was added, and no job built images. | Dockerfiles fixed; the `images` job builds the three on every pull request |
| F-03 | Medium | Database performance | 41 foreign keys had no index starting with their column; seven back real queries. | Migration `V0010` adds the seven indexes |
| F-04 | Medium | Database correctness | `UNIQUE` on the nullable `Carts.GuestToken` would have allowed one signed-in cart in the table. | Filtered unique index |
| F-05 | Medium | Security | Trusting the server certificate was hard-coded to true in three places. | `DB_TRUST_SERVER_CERTIFICATE`; the backend never trusts by default in production |
| F-06 | Medium | Maintainability | The tSQLt runner duplicated the retry, the sequential helper and the batch splitter. | Shared; about 80 lines removed |
| F-07 | Medium | Correctness | An object removed from the repository stayed alive in the database and `db:verify` could not see it. | `OBJECT_REMOVED` check, with a test |
| F-08 | Medium | Reliability | After `SIGTERM` the server waited for idle connections; unhandled rejections left the process running. | Idle connections closed, eight-second forced exit, fatal logging |
| F-09 | Low | Security | Containers kept default Linux capabilities. | `cap_drop: ALL` and `no-new-privileges` |
| F-10 | Low | Process | Dependabot proposed major upgrades that broke `main` twice. | Majors ignored, the other Dockerfiles watched |
| F-11 | Low | Quality | The migration register could drift silently from the files. | `sql:lint` fails on any mismatch, also on Windows |
| F-12 | Medium | Operability | `/health/ready` checked the connection only. | Compares the schema version with the one declared in code (was D-01) |
| F-13 | Medium | Database | The collation was the instance default. | `Latin1_General_100_CI_AS_SC`, [ADR-0025](../adr/0025-database-collation.md) (was D-04) |
| F-14 | Low | Process | The `images` job was not a required check. | Required by the ruleset (was D-12) |
| F-15 | Low | Backend | The deadlock retry had no back-off. | Full-jitter exponential delay (was D-09) |
| F-16 | Low | Frontend | `formatMoney` was missing. | Implemented from the decimal string, six tests (was D-10) |
| F-17 | Medium | Reliability | A SQL Server started with `MSSQL_COLLATION` changes its collation inside the process for about ten seconds, and a database created then stopped the server. | The runner waits for the change to finish |

### 4.2 Revision 2 (since 30 October)

| ID | Severity | Area | Finding | Fix |
|---|---|---|---|---|
| F-18 | High | Correctness | The cart accepted a quantity above the available stock, and the guest-cart merge at sign-in ignored the limit (acceptance criterion of RF-04). | `SP_Cart_SetItemQuantity` answers `409 INSUFFICIENT_STOCK`; the merge clamps; shared function `FU_Cart_AvailableStock`; 13 tSQLt tests and one HTTP flow (#39) |
| F-19 | High | Reliability | The start-up gate treated any failed query as "ready", so a deadlock or a cut connection during the collation change let `CREATE DATABASE` through and shut the server down (error 3434). | It fails closed, confirms the settled state twice and stops with `SERVER_SHUT_DOWN` and the fix (#40) |
| F-20 | Medium | Security | There was no way to sign in on a fresh stack without writing a password in the repository. | Passwords generated into the local `.env`, hashed with Argon2id by the seed step through `SP_Users_Provision`, skipped on `_CI` databases; no password and no hash in the repository (#40) |
| F-21 | High | Database performance | Lists and reports read far more than needed: `COUNT(*) OVER ()` spooled to `tempdb`, one cached plan served customers and staff, and a filter was not sargable. | Rewritten procedures and new indexes (`V0012`): order list from 483,437 reads and 252 ms to 767 reads and about 20 ms, abandoned carts from 162,724 to 529, audit log from 3.3 s to 38 ms, stock ledger from 713 to 29 ms (#41) |
| F-22 | Medium | Database concurrency | Readers blocked writers under the default isolation level. | `READ_COMMITTED_SNAPSHOT` applied and verified by the runner, which waits for the other sessions (#41) |
| F-23 | Medium | Database growth | Tables that only grow had no retention. | `SP_Retention_Purge` in batches (refresh token families, webhooks, guest carts, orphan reservations, `DdlHistory`) and `SP_Jobs_PurgeExpired` daily; periods in `Configuration` (`S0006`) (was D-08) (#41) |
| F-24 | Medium | Security | The idempotency middleware and the layered rate limiter were not yet on the routes. | Both run on every route with the documented policies (was D-05) |
| F-25 | Medium | Reliability | Expiry of reservations and payments, purge and reconciliation were not running. | Job runner inside the API process, each job behind a session `sp_getapplock` so several replicas are safe (was D-06) |
| F-26 | Low | Testability | No guard against regressions in query cost. | `npm run sql:bench` with 50,000 orders (#41) |
| F-27 | Medium | Verification | The delivery could only be checked by reading code. | Postman collection (now minimal, 38 requests and 66 assertions) in English and Spanish, with a unit test that keeps both equal to the OpenAPI contract and to each other (#42, #43) |
| F-28 | Medium | Documentation | The architecture diagrams showed a payment gateway, two API replicas and module dependencies that do not exist. | Diagrams aligned with what is built (#42) |
| F-29 | Medium | Documentation | The documents cited confirmations from the evaluator and described shipping, which is not part of the delivery. | Removed (#44); the references that mirror the existing schema remain (D-25) |
| F-30 | Low | Documentation | There was no route from a clean machine to a complete test. | Quick start in both READMEs with the `npm.cmd` fallback and a table of the usual failures (#43) |
| F-31 | Low | Process | The name of the bakery appeared in test data, seeds and titles. | Renamed to "Pastelería" everywhere except the read-only brief (#42) |
| F-32 | Low | Process | `gitleaks` flagged dummy values in tests; Sonar flagged an `await` in a loop and a `PATH` hotspot. | Allowlist for the dummy values, explicit sequential reads, `process.execPath` |
| F-33 | Low | Database | The tSQLt suite failed (388 errors) when the demo accounts were seeded into the CI database. | The seed step skips databases whose name ends in `_CI` |
| F-34 | Low | Operability | The recovery model of a new database is `FULL`, which grows the log until the disk is full if nobody backs it up. | Runbook section "Backups and recovery" with the choice per environment (see also A-03) |
| F-35 | Medium | Frontend | The frontend had no generated API client, no forms library, no charts and no end-to-end tool, and `api:generate` was a placeholder. | `openapi-typescript` and `openapi-fetch` (generated types committed, `npm run api:check` in CI), react-hook-form with zod, Recharts and Playwright with a smoke test; a unit test calls a route through the typed client (5 November) |

## 5. Debt register (open)

Severity is the impact if it is never addressed; effort is in working hours of one engineer. The target says when it naturally belongs.

| ID | Severity | Area | Description | Recommended action | Effort | Target |
|---|---|---|---|---|---|---|
| D-15 | **High** | Security, dependencies | `multer` 2.0.2 is installed and the upload route of payment proofs is production code. `npm audit --omit=dev` lists nine denial-of-service advisories for versions up to 2.4.0 (resource exhaustion, uncontrolled recursion, crafted field names, a file-size bypass through an async filter, incomplete cleanup of aborted uploads). The route limits the size, the file count and the fields, which narrows but does not remove the exposure. | Merge pull request #45 (it moves `multer` to 2.5.0, with `jose` 6.2.15, `@node-rs/argon2` 2.2.2 and `@tanstack/react-query`); all its checks pass (`integration` is skipped) | 0.5 | Now |
| D-16 | Medium | CI | No job runs `npm audit` or any dependency scan, so D-15 was found by hand. The fix only travels in the weekly grouped pull request of Dependabot (#45). | Add a job `npm audit --omit=dev --audit-level=high` and require it | 1 | Now |
| D-03 | Medium | Testing, CI | The 17 HTTP flows exist (`npm run test:integration -w backend` against a migrated SQL Server) but the `integration` job is `if: false`, is not a required check, and the `test:integration` script of the root is a placeholder. | Enable the job reusing the SQL Server of `sql-tests`, point the root script at the backend, require it | 3 | Before Phase 2 ends |
| D-14 | Medium | Delivery | The catalogue (about 60 products), the coupons `WELCOME10`, `CAKES25`, `SOLDOUT` and `EXPIRED` and a bank account are not seeded: a fresh stack has an empty store. The accounts and the performance dataset (`sql:bench`) exist. | Write the demo seeds; the frontend cannot be built or demonstrated without them | 6 | First day of Phase 2 |
| D-24 | Medium | Security, frontend | Decided in [ADR-0026](../adr/0026-refresh-token-in-an-httponly-cookie.md): the refresh token goes in an `HttpOnly; SameSite=Strict` cookie, as the design says. The backend still returns it only in the body and reads it only from the body. | Set the cookie in `login` and `refresh`, read it first in `refresh` and `logout` (body as fallback), clear it on `logout`, update the OpenAPI document and add the tests | 3 | Before the authentication screens |
| D-19 | Medium | Backend, reliability | The SQL connection pool has no `error` listener, a fixed maximum of 10 connections and no explicit `requestTimeout`; none is configurable. A broken connection can raise an unhandled `error` event, which would end the process. | Listen to the pool errors and log them, move `max`, `requestTimeout` and `idleTimeoutMillis` to validated environment variables | 2 | Phase 2 |
| D-20 | Medium | Documentation, configuration | Card payment is described as existing but inactive ("its code exists"). In the repository there is only configuration and the availability rule: `cardAvailable` is hard-coded to `false` in the composition root, there is no Recurrente adapter, and the simulator is a placeholder. The variables `RECURRENTE_*` and `PAYMENTS_CARD_ENABLED` (default `true`) are validated but never read, so setting credentials changes nothing. [ADR-0017](../adr/0017-own-recurrente-adapter.md) and [recurrente](../payments/recurrente.md) describe a design that is not built; Stage 8 of the roadmap was dropped for that reason. | Say "design only" in the READMEs and the two documents, or delete the dead variables, the simulator and the compose service; do not keep a default of `true` that does nothing | 2 | Phase 2 |
| D-02 | Medium | Security | No `Content-Security-Policy` on the pages served by the edge, and no TLS: nginx listens on plain HTTP, so HSTS has no meaning yet. | Add CSP once the application exists and verify it in a browser; document that TLS ends at the platform in front of nginx and add HSTS there | 3 | Phase 2 |
| D-17 | Low | CI, tooling | The Playwright scenarios are not part of CI (they need the browser and the complete stack) and `npm run sonar` is still a placeholder. | Run the end-to-end suite in a job that starts the stack, once the deposit scenario exists; the SonarQube profile stays optional | 4 | Phase 2 |
| D-21 | Low | Documentation | Figures and state drifted: both READMEs say 523 unit tests and 561 pass; `ROADMAP.md` was corrected on 5 November. | Correct the counts, and stop hard-coding what a test can print | 0.5 | Now |
| D-22 | Low | Supply chain | Dependabot does not watch the images of `docker-compose.yml`: `mssql/server:2022-latest` is a floating tag and the edge uses nginx 1.27 while the frontend image uses 1.31. GitHub Actions and base images are pinned by tag, not by digest. | Watch the compose file, pin the SQL Server image to a cumulative update, align nginx, consider digests | 2 | After Phase 2 |
| D-23 | Low | Security | The access token uses one symmetric secret, with no `kid` and no audience: rotating the secret signs everybody out and a second service could not verify tokens without sharing it. | Add `aud` and `kid`; move to an asymmetric key only if a second verifier appears | 3 | After Phase 2 |
| D-25 | Low | Database, documentation | Shipping is out of scope but the schema keeps `Orders.Shipping`, its constraint and trigger, the `ShippingCost` and `FreeShippingFrom` settings and the `shipping` field of the API, always `0.00`. The documents that mirror the schema still mention them. | Decide: accept and document it as reserved, or drop the column and settings with a new migration `V0013` and adjust tests, API and OpenAPI | 4 | After Phase 2 |
| D-26 | Low | Observability | `platform/telemetry` contains only a README; there are request ids and structured logs but no metrics, and the `observability` compose profile has nothing to collect. A comment in `pool.ts` names a procedure that no longer exists. | Add basic business and database metrics, or state that observability is limited to logs | 4 | After Phase 2 |
| D-11 | Low | Dependencies | Major upgrades pending: `mssql` 12, `eslint` and `@eslint/js` 10, `react` and `react-dom` 19 with their types, `jsdom` 31, `i18next` 26, `react-i18next` 17, `@vitejs/plugin-react` 6, `commitlint` 21, `cspell` 10, `dependency-cruiser` 18, `lint-staged` 17. | One pull request per major, with tests, after Delivery Phase 2 | 8 | after Phase 2 |
| D-07 | Low | Database | Constraints refer to fixed status identifiers (`IDOrderStatus IN (1, 6)`), coupling migrations to seed values. | Accepted and documented; revisit only if the states change | 0 | none |

## 6. Anticipated debt

Not defects today. Each one becomes a problem at a stated point, and the table says what to do then.

| ID | Area | What will happen | Trigger | Plan |
|---|---|---|---|---|
| A-01 | Rate limiting | Counters live in memory and use a fixed window: they reset on restart, are per instance, and allow twice the limit across a window boundary. | A second replica of the API | The store is a port; add a shared adapter (ADR-0010) |
| A-02 | File storage | Proofs sit on a named volume of one node, outside any backup, and a database failure after the file is saved relies on the compensating delete. | More than one node, or any backup requirement | Object storage adapter behind `FileStoragePort`, and a job that lists files without a row |
| A-03 | Recovery | One SQL Server instance, no automated backup, no stated recovery point or recovery time. | Any production use | Define RPO and RTO, schedule full, differential and log backups, test a restore |
| A-04 | Data growth | The ledgers (`InventoryMovements`, the financial ledger, the audit log) are append-only by design and the retention job leaves them alone. | Years of volume; the 50,000-order benchmark is comfortable | Archive or partition by date; keep the reconciliation views valid across the archive |
| A-05 | Money | The half-even rule exists in SQL and in TypeScript. The shared vectors catch drift, but a new rule must be written twice. | Any new discount or tax rule | Keep the differential tests as a gate; prefer doing new rules in SQL only |
| A-06 | API contract | One hand-written OpenAPI file of about 3,600 lines, kept equal to the routes by a test. | Client generation and more operations | Split by module, generate the client, add Schemathesis |
| A-07 | Jobs | Background jobs run inside the API process; the application locks make several replicas safe, but a heavy job competes with traffic. | Long reconciliation runs | Run the same runner as a separate worker process |
| A-08 | Database | Read committed snapshot keeps row versions in `tempdb`; a long transaction makes the version store grow. | A slow report or a stuck session | Alert on the version store size and on the oldest open transaction |

## 7. Risks for Delivery Phase 2 (Monday 9 November, 23:59)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Four days for every screen of the shop, the administration and the dashboard | High | High | Build the route in the order customer purchase, deposit proof, review queue, dashboard; cut charts and extras before the purchase flow |
| Empty store while developing and demonstrating | High | High | D-14 on the first day |
| Authentication screens built on an unresolved token decision | Medium | High | Backend change of ADR-0026 first, then the screens (D-24) |
| A vulnerable dependency reaches the delivery | Medium | Medium | D-15 and D-16 now |
| The `integration` job stays off and a regression reaches `main` unseen | Medium | Medium | D-03, using the SQL Server that `sql-tests` already starts |
| CSP breaks the application at the end | Medium | Medium | Add it in a branch and verify in a browser, not on the last day (D-02) |

## 8. Not verified in this revision

- The tSQLt, concurrency and HTTP suites were not run locally today; their evidence is the CI run of pull request #45 (`sql-tests` passes, `integration` is skipped) and the runs of the previous days.
- Line coverage was not re-measured.
- The behaviour of the application in a browser, including any security header on the pages.
- Restoring a backup, and the behaviour of the stack under sustained load beyond `sql:bench`.
- Docker Desktop on Windows beyond the maintainer's own start-up of the stack on 1 November, which is not re-run here.

## 9. Recommendations

1. Merge pull request #45 (D-15) and add the audit step to CI (D-16). Both are under two hours.
2. Fix the figures and the roadmap (D-21) so that the documents do not contradict the repository.
3. Write the demo seeds (D-14) and implement the cookie of ADR-0026 (D-24) before the first screen.
4. Enable the `integration` job (D-03) while the frontend is being built, so that API regressions stay visible.
5. Decide the card payment documents (D-20) and the shipping column (D-25) once, so that the READMEs and the schema say the same.
6. Schedule D-17 and D-19 inside Phase 2 and the rest after the delivery.
