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
| [ ] 7 | Frontend: auth, catalogue, cart, checkout and deposit, admin and review queue, dashboard, responsive | 3 to 5 Nov | Phase 2 | 6 | Role-based routes, loading/empty/error states, transparent refresh; implement `formatMoney` and un-skip its test |
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

- [ ] `formatMoney` in `frontend/src/shared/lib/money` and its skipped test (Stage 7).
- [ ] Replace the `db-migrate` placeholder with the real runner and a `db/runner/Dockerfile` (Stage 2).
- [ ] Enable the `sql-tests` and `integration` CI jobs (Stage 2).
- [ ] Add the `windows-smoke` CRLF checksum test (Stage 2).
- [x] Evaluator question about `PendingPayment` answered affirmatively (open question 4).
- [ ] Dependabot: ignore major versions and group minor and patch updates (before Stage 2).
- [ ] Enable "Automatically delete head branches" in the repository settings (before Stage 2).
- [x] Create the `CI_SA_PASSWORD` secret for the `sql-tests` job, as a repository and a Dependabot secret.
- [ ] Add `SONAR_TOKEN` as a Dependabot secret so the required `sonarcloud` check can pass on Dependabot pull requests (before Stage 2).
- [ ] Add `sql-tests` and `integration` to the required checks of the ruleset once they are enabled (Stage 2).
- [ ] Generate the `SEED_*_PASSWORD` variables in `ensure-env` and `.env.example`, and create the demo accounts with a Node seed step that calls `SP_Users_Register` (Stage 2, see [test accounts](../operations/test-accounts.md)).
- [ ] Plan the first Stage 2 task as the tSQLt spike; choose plan B if it cannot install (Stage 2).
