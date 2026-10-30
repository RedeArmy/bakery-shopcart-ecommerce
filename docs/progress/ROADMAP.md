# Roadmap

"Stage" is a unit of work. "Delivery Phase" is one of the two challenge deadlines: **Phase 1 (database and backend) Monday 2 November 2026, 23:59** and **Phase 2 (frontend and everything complete) Monday 9 November 2026, 23:59**. Owner of every stage: the lead engineer. Rule: tooling (Sonar, observability, Playwright) does not start before the critical procedures and their tests are green.

| Stage | Content | Target | Delivery | Depends on | Acceptance |
|---|---|---|---|---|---|
| [x] 0 | Foundations: monorepo, tooling, compilable skeleton, Docker and CI skeleton | Wed 28 Oct | Phase 1 | none | `npm ci`, lint, typecheck, test, arch:check and spell pass; the deliberate violation is detected; `docker compose config` is valid |
| [x] 1 | Documentation and conventions: ADRs, architecture docs, progress tracking, bilingual README | Wed 28 Oct | Phase 1 | 0 | 24 ADRs, all listed documents, Mermaid valid, READMEs in sync |
| [ ] 2 | Migration runner (`SchemaVersion`, `ObjectVersions`, checksums, `db:verify`), core tables V0001 to V0009, seeds, tSQLt spike | Thu 29 Oct | Phase 1 | 0, 1 | Database builds from scratch twice with the same checksums on Windows and Linux; tSQLt installs and runs one test, or plan B is chosen |
| [ ] 3 | Functions, views, triggers (money, state machines, immutability); procedures for auth, catalogue and inventory (atomic reservation) | Thu 29 Oct | Phase 1 | 2 | `Test_Money` and `Test_Inventory` green; 100 parallel reservations of 1 unit give exactly 1 success |
| [ ] 4 | Cart, coupons, `CreateOrder`, `ConfirmPayment`, deposit flow, idempotency, returns, financial ledger, audit log; tSQLt suites | Fri 30 Oct | Phase 1 | 3 | States, immutability, coupons, payments and permissions suites green; `sp-coverage` passes; reconciliation views return 0 rows |
| [ ] 5 | Backend slices, JWT with rotating refresh, idempotency and rate-limit middleware, secure proof upload, review queue, OpenAPI | Sat 31 Oct | Phase 1 | 4 | Endpoints match the contract; 401/403/404 behaviour verified; sixth login in a minute answers 429 |
| [ ] 6 | Dashboard, jobs (expiry, reconciliation), concurrency/idempotency/IDOR/money tests, README final review, freeze | Sun 1 Nov | **Phase 1, Mon 2 Nov 23:59** | 5 | All Phase 1 checklist items in the [definition of done](../quality/definition-of-done.md); tag `release: phase 1` with hours to spare |
| [ ] 7 | Frontend: auth, catalogue, cart, checkout and deposit, admin and review queue, dashboard, responsive | 3 to 5 Nov | Phase 2 | 6 | Role-based routes, loading/empty/error states, transparent refresh |
| [ ] 8 | Card payments: Recurrente adapter, webhook, verification, reconciliation job, simulator; validate unverified API points with test keys | 6 to 7 Nov | Phase 2 | 6 | Card purchase works against the simulator; open questions 5 resolved |
| [ ] 9 | Method switching, refunds, SonarQube, Schemathesis, Playwright, extras, defence rehearsal | Sun 8 Nov | Phase 2 | 7, 8 | End-to-end scenarios green; quality profile runs |
| [ ] 10 | Final polish and push | Mon 9 Nov | **Phase 2, Mon 9 Nov 23:59** | 9 | Clean-machine run from the README only; tag `release: phase 2` |

## Repository hardening (between Stage 1 and Stage 2, done on 29 Oct)

- [x] GitHub Actions pipeline passing on `main` with nine required jobs.
- [x] Ruleset that protects `main`: pull request, all checks, linear history, no bypass.
- [x] SonarCloud analysis with a passing quality gate and coverage above 80 % on production code.
- [x] Node 26 LTS as the runtime in `.nvmrc`, `engines`, CI and Docker.
- [x] Controlled dependency upgrades (`vitest` pair, `@eslint/js` kept on 9.x).
- [x] Branches cleaned up: only `main` remains.

Stages 2 to 6 now have to fit in the four days before Delivery Phase 1; see the calendar risk in [STATUS](STATUS.md).

## Tracked follow-ups

- [x] `formatMoney` in `frontend/src/shared/lib/money` with its tests.
- [x] Write the migration runner in `db/runner` (`npm run db:migrate` and `db:verify`, Stage 2, branch `feat/stage-2-migration-runner`).
- [x] Replace the `db-migrate` placeholder with the runner image (`db/runner/Dockerfile`); the whole compose stack was built and started with it (Stage 2).
- [x] Enable the `sql-tests` CI job: `run-tsqlt.ts` now uninstalls tSQLt instead of dropping the database, and the `sql:coverage` step waits for `sp-coverage.ts` (Stage 2).
- [x] Write `sp-coverage.ts` and put `sql:coverage` back in the `sql-tests` job (Stage 2).
- [ ] Enable the `integration` CI job (Stage 2).
- [x] Add the `windows-smoke` CRLF checksum test: the runner tests run on Windows in CI and cover CRLF, LF and a byte order mark (Stage 2).
- [x] Evaluator question about `PendingPayment` answered affirmatively (open question 4).
- [x] Dependabot: ignore major versions and group minor and patch updates; it also watches the frontend and runner Dockerfiles (done in the technical audit).
- [x] "Automatically delete head branches" stays off: a decision of the owner, who deletes merged branches by hand.
- [x] Create the `CI_SA_PASSWORD` secret for the `sql-tests` job, as a repository and a Dependabot secret.
- [x] Add `SONAR_TOKEN` as a Dependabot secret so the required `sonarcloud` check can pass on Dependabot pull requests; verified on 30 Oct (the secret is listed and the three open Dependabot pull requests pass `sonarcloud`).
- [x] `sql-tests` is a required check of the active ruleset (verified against GitHub on 30 Oct).
- [x] Add the three `images` contexts to the required checks of the ruleset.
- [ ] Add `integration` to the required checks when it is enabled (Stage 3 and 4).
- [x] Write the core schema (`V0001` to `V0009`) and the reference seeds (`S0001` to `S0005`: roles, order and payment states and transitions, payment methods, movement types, configuration) (Stage 2).
- [ ] Write the demo seeds (postponed to the end of the project at the user's request): catalogue of about 60 products, coupons `WELCOME10`, `CAKES25`, `SOLDOUT` and `EXPIRED`, a bank account, and the performance data (Stage 2).
- [ ] Generate the `SEED_*_PASSWORD` variables in `ensure-env` and `.env.example`, and create the demo accounts with a Node seed step that calls `SP_Users_Register` (Stage 2, see [test accounts](../operations/test-accounts.md)).
- [x] tSQLt spike: installs and runs on the SQL Server 2022 Linux image and Docker Desktop; plan B not needed (29 Oct).
- [x] Vendor tSQLt 1.0.8083.3529 with its checksums, kept byte for byte and verified by `npm run sql:lint` on Linux and Windows (Stage 2, branch `feat/stage-2-vendor-tsqlt`).
- [x] Write `db/tests/scripts/run-tsqlt.ts` so that `npm run sql:test` installs tSQLt and exports the JUnit XML (Stage 2).
