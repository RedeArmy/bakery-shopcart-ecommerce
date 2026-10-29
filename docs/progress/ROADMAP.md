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

## Tracked follow-ups

- [ ] `formatMoney` in `frontend/src/shared/lib/money` and its skipped test (Stage 7).
- [ ] Replace the `db-migrate` placeholder with the real runner and a `db/runner/Dockerfile` (Stage 2).
- [ ] Enable the `sql-tests` and `integration` CI jobs (Stage 2).
- [ ] Add the `windows-smoke` CRLF checksum test (Stage 2).
- [ ] Send the evaluator question about `PendingPayment` (open question 4).
