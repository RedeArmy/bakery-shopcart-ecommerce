# Decision log

One dated line per decision, newest last. Architectural decisions link to their ADR.

| Date | Decision | Link |
|---|---|---|
| 2026-10-28 | Modular monolith with vertical slices and hexagonal modules | [ADR-0001](../adr/0001-modular-monolith-with-vertical-slices.md) |
| 2026-10-28 | Critical rules live in stored procedures and `CHECK` constraints | [ADR-0002](../adr/0002-critical-rules-in-stored-procedures-and-checks.md) |
| 2026-10-28 | Own forward-only migration runner in Node | [ADR-0003](../adr/0003-own-forward-only-migration-runner-in-node.md) |
| 2026-10-28 | Idempotency at two levels (middleware and unique indexes) | [ADR-0004](../adr/0004-idempotency-at-two-levels.md) |
| 2026-10-28 | The server never takes cards; deposit is our own, card is hosted | [ADR-0005](../adr/0005-server-never-takes-cards.md) |
| 2026-10-28 | Eight order states with transitions stored as data | [ADR-0006](../adr/0006-order-lifecycle.md) |
| 2026-10-28 | Stock reservation as an expiring counter | [ADR-0007](../adr/0007-stock-reservation-as-expiring-counter.md) |
| 2026-10-28 | VAT included; base computed by subtraction | [ADR-0008](../adr/0008-vat-included-and-how-it-is-calculated.md) |
| 2026-10-28 | "Completed order" means paid and not cancelled, net of returns | [ADR-0009](../adr/0009-definition-of-completed-order-for-reports.md) |
| 2026-10-28 | Layered rate limiting (nginx, Express, database lockout) | [ADR-0010](../adr/0010-layered-rate-limiting.md) |
| 2026-10-28 | OpenAPI is written first and the client is generated | [ADR-0011](../adr/0011-contract-first-openapi.md) |
| 2026-10-28 | Versioned SQL objects, drift detection, expand/contract | [ADR-0012](../adr/0012-versioning-of-sql-objects-and-expand-contract.md) |
| 2026-10-28 | Cart uses absolute quantities | [ADR-0013](../adr/0013-cart-with-absolute-quantities.md) |
| 2026-10-28 | Order is created as `PendingPayment` | [ADR-0014](../adr/0014-order-created-as-pending-payment.md) |
| 2026-10-28 | Payment state machine separate from the order's | [ADR-0015](../adr/0015-payment-state-separated-from-order-state.md) |
| 2026-10-28 | Deposit window is `MIN(24 h, delivery − lead time)` | [ADR-0016](../adr/0016-deposit-window-capped-by-delivery-date.md) |
| 2026-10-28 | Own Recurrente adapter and Svix verifier | [ADR-0017](../adr/0017-own-recurrente-adapter.md) |
| 2026-10-28 | Payment proofs in a private volume behind a port | [ADR-0018](../adr/0018-storage-of-payment-proofs.md) |
| 2026-10-28 | Half-even rounding and integer arithmetic | [ADR-0019](../adr/0019-half-even-rounding-and-integer-arithmetic.md) |
| 2026-10-28 | Amounts are decimal strings in the API | [ADR-0020](../adr/0020-amounts-as-decimal-strings-in-the-api.md) |
| 2026-10-28 | Append-only financial movements ledger | [ADR-0021](../adr/0021-financial-movements-ledger.md) |
| 2026-10-28 | `npm run` entry point, LF endings, Windows and Linux support | [ADR-0022](../adr/0022-windows-linux-environment-and-npm-run.md) |
| 2026-10-28 | tSQLt in CI only, never in the delivered database | [ADR-0023](../adr/0023-sql-tests-with-tsqlt-in-ci-only.md) |
| 2026-10-28 | British English everywhere, Spanish comments, Spanish UI copy | [ADR-0024](../adr/0024-language-and-spelling-conventions.md) |
| 2026-10-28 | Backend uses Express 5, zod 3.25, pino 9 and the `mssql` driver; frontend uses React 18, Vite, Tailwind 4 | none |
| 2026-10-28 | Connectivity check in `/health/ready` uses the driver connection, not inline SQL; Stage 2 swaps it for `SP_System_GetSchemaVersion` | none |
| 2026-10-28 | `npm run up` generates `.env` secrets locally so a clean machine needs no manual step | [ADR-0022](../adr/0022-windows-linux-environment-and-npm-run.md) |
| 2026-10-28 | `db-migrate` is a placeholder that creates the database and login with `sqlcmd` until the Stage 2 runner exists | none |
| 2026-10-28 | The spelling check ignores a line carrying the marker `spelling-ignore`, and cspell ignores comments per file type | [ADR-0024](../adr/0024-language-and-spelling-conventions.md) |
| 2026-10-29 | The runtime is Node 26 LTS (`.nvmrc`, `engines`, CI, Docker images and `@types/node`), verified on `node:26-slim` and with the full compose stack; Node 25 was discarded because it is not an LTS release | [ADR-0022](../adr/0022-windows-linux-environment-and-npm-run.md) |
| 2026-10-29 | `@eslint/js` stays on 9.x to match `eslint` 9; the merged major bump made `npm install` fail with ERESOLVE | none |
| 2026-10-29 | `main` is protected by a ruleset (pull request, all checks including SonarCloud, no bypass); SonarCloud analyses from GitHub Actions with coverage | none |
| 2026-10-29 | The evaluator confirmed that creating the order as `PendingPayment` is valid; ADR-0014 is fully accepted and the deposit-request fallback is dropped | [ADR-0014](../adr/0014-order-created-as-pending-payment.md) |
| 2026-10-29 | The audit log actions are `Create`, `Update`, `Deactivate` and `StatusChange` (a `CHECK` constraint) and its modules are `Products`, `Prices`, `Stock`, `Coupons`, `Orders` and `Payments` | [reference values](../database/er-diagram.md#reference-and-seed-values) |
| 2026-10-29 | The demo coupons are `WELCOME10`, `CAKES25`, `SOLDOUT` and `EXPIRED`, in British English; the last two exist to exercise the exhausted and expired messages | [reference values](../database/er-diagram.md#reference-and-seed-values) |
| 2026-10-29 | The test accounts are one administrator, one operator and two customers on the reserved `.test` domain; their passwords are generated at random into the local `.env`, hashed with argon2id by a Node seed step and never stored in the repository | [test accounts](../operations/test-accounts.md) |
| 2026-10-29 | tSQLt 1.0.8083.3529 is the pinned version: the spike installed it on the SQL Server 2022 Linux image and Docker Desktop, so plan B (Vitest-based SQL tests) is not adopted | [ADR-0023](../adr/0023-sql-tests-with-tsqlt-in-ci-only.md) |
| 2026-10-29 | The vendored tSQLt files are stored byte for byte with `-text` and verified against `SHA256SUMS` by `sql:lint`, because the repository forces LF and the files use CRLF; the secret scan still covers them, as gitleaks reports nothing | [vendored files](../../db/tests/tsqlt/install/README.md) |
| 2026-10-29 | The repository is public so that GitHub Actions runs without billing limits | none |
| 2026-10-29 | CI secrets are created twice, as repository secrets and as Dependabot secrets, because Dependabot pull requests only receive the latter; `CI_SA_PASSWORD` is done and `SONAR_TOKEN` is pending for Dependabot | none |
| 2026-10-29 | The SonarCloud threshold is kept and tests were added for the uncovered production code, instead of lowering the gate or excluding code | none |
| 2026-10-29 | `vitest` and `@vitest/coverage-v8` are upgraded together, and Dependabot bumps of major versions are reviewed one by one in a branch, because ungrouped bumps broke `main` | none |
| 2026-10-29 | The repository scripts run git from fixed absolute paths and never through the `PATH` variable, to resolve a SonarCloud security hotspot | none |
| 2026-10-29 | The tSQLt runner recreates the `_CI` test database on every run and refuses non-local hosts, because `tSQLt.class.sql` cannot be reinstalled over an existing installation | none |
| 2026-10-29 | The gitleaks configuration allow-lists the documented `IdempotencyKeyHours` setting, which the generic API key rule mistook for a secret | none |
| 2026-10-29 | The husky hooks call `node` directly instead of `npx`, because `npx` is a bash script that resolves to WSL bash on some Windows setups | none |
| 2026-10-29 | The commitlint body line-length rule is switched off, because GUI Git clients do not wrap long lines | none |
| 2026-10-29 | Health checks use `127.0.0.1` instead of `localhost`, because Alpine resolves `localhost` to IPv6 while nginx listens on IPv4 | none |
| 2026-10-28 | Demo coupon codes are `WELCOME10` and `CAKES25` (the prompt wins over the design's Spanish codes) | none |
