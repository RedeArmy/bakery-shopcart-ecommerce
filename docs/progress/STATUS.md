# Status

_Last updated: Thursday 29 October 2026 (end of the repository hardening session)._

## Current stage

**Stages 0 and 1 are complete and the repository is hardened. Stage 2 is next.** Delivery Phase 1 is due Monday 2 November 2026, 23:59, so four days remain for Stages 2 to 6.

## Done since the last update

- **Continuous integration runs on GitHub.** Nine jobs pass on `main`: `lint`, `typecheck`, `unit`, `architecture`, `secrets`, `sql-lint`, `compose-validate`, `windows-smoke` and `sonarcloud`. The `sql-tests` and `integration` jobs stay switched off until Stage 2.
- **`main` is protected by an active ruleset:** a pull request is required, all nine checks must pass, history is linear, force pushes and deletion are blocked and nobody can bypass it.
- **SonarCloud analyses every change** from GitHub Actions. The quality gate passes and no issues are open. The `PATH` hotspot was fixed in the code by running git from fixed absolute paths.
- **Coverage of production code:** backend 88 %, frontend 80 % (vitest 5 counts lines differently from vitest 3, so these figures are not comparable with the earlier 92 % and 86 %). Tests were added for the stored-procedure executor, the connection pool, the error handler, the request id, the composition root and the frontend shell instead of lowering the threshold.
- **The runtime is Node 26 LTS** in `.nvmrc`, `engines`, CI, the Docker images and `@types/node`. It was verified on `node:26-slim` with the complete compose stack. Node 25 was evaluated and discarded.
- **Dependencies:** `vitest` and `@vitest/coverage-v8` were upgraded together to 5.0.5; `@eslint/js` stays on 9.x to match `eslint` 9; the Dependabot bumps of `pino`, `commitlint` and the GitHub Actions were merged.
- **Fixes found by the first CI runs:** a gitleaks false positive on a documented configuration key, backtracking regular expressions in the spelling check, health checks that used `localhost` (IPv6) instead of `127.0.0.1`, husky hooks that called `npx` (a bash script that resolves to WSL bash on some Windows setups), and a commitlint line-length rule that GUI clients cannot satisfy.
- **The repository is public**, so GitHub Actions runs without billing limits. Only `main` exists as a branch.
- **The `CI_SA_PASSWORD` secret exists** as a repository secret and as a Dependabot secret (created on 29 Oct). The `sql-tests` job will use it as the password of the throwaway SQL Server in CI. Its value cannot be read back, so it is only proven when the job is enabled in Stage 2.

## Next

1. **Housekeeping:** enable "Automatically delete head branches" in GitHub; update the primary checkout (`git pull --ff-only`) and run `npm ci` with Node 26; restart the terminals and tools that still hold the old `PATH`.
2. **Dependabot configuration** in a pull request: ignore major versions and group minor and patch updates, because ungrouped major bumps broke `main` twice (the vitest pair and `@eslint/js`).
3. **Add `SONAR_TOKEN` as a Dependabot secret.** Dependabot pull requests do not receive repository secrets, so without it the required `sonarcloud` check fails on them. Run `gh secret set SONAR_TOKEN --app dependabot` (it prompts for the value) or use Settings, Secrets and variables, Dependabot.
4. **Stage 2:** tSQLt is vendored and `npm run sql:test` installs it and exports the JUnit XML; next Stage 3 (functions, views and the procedures for auth, catalogue and inventory). The demo seeds (catalogue, coupons, bank account, accounts) are postponed to the end. Use one small pull request per block. When `sql-tests` and `integration` are enabled, add them to the required checks of the ruleset.

## Spike results

- **tSQLt works on the Linux SQL Server image and on Docker Desktop (WSL2)**, so the first risk of the register is closed and plan B is not needed. It was verified with tSQLt 1.0.8083.3529 on SQL Server 2022 CU27, starting from `clr strict security` enabled. A failing test makes `sqlcmd -b` exit with code 1 and the results export as JUnit XML. The lessons for writing the tests (identity values are not rolled back, test order is not fixed) are in [the tSQLt testing document](../quality/sql-testing-tsqlt.md#spike-result-29-october-2026).

- **The runner is the `db-migrate` service.** `db/runner/Dockerfile` builds it in two stages on `node:26-slim` with a non-root user. It was checked by building and starting the whole compose stack: the schema and seeds are applied, a second run changes nothing, the application login can run procedures but cannot read a table, and rotating `DB_APP_PASSWORD` realigns the login. The backend and frontend images had stopped building since the `db/tests/scripts` workspace was added (their `npm ci` did not find it); that is fixed.
- **`sql:coverage` is back in the job.** `sp-coverage.ts` fails when a critical procedure has no tSQLt test; today it reports 0 procedures and the 11 critical ones still to be built.
- **The reference seeds exist.** `S0001` to `S0005` load the roles, the order and payment states with their transitions, the payment methods, the inventory movement types and the ten configuration settings. A new `Test_Seeds` class checks each table against the documented values, and the suite now has 65 tests. Re-running a seed changes nothing and does not overwrite a tuned setting. The migration register marks V0001 to V0009 as applied after pull request #18 and lists the seeds. Demo data (catalogue, coupons, bank account, demo accounts) and the performance seed are still to come.
- **The core schema exists.** Migrations `V0001` to `V0009` create 40 tables (plus the two control tables of the runner) of the design with the glossary names, their `CHECK` constraints and filtered unique indexes, the insert-only and frozen-amount triggers, the transition triggers and the DDL capture. The tSQLt suite grew from 4 to 52 tests (schema shape, every constraint and trigger on the real tables) and passes in a throwaway SQL Server 2022, which also found a flaw in the design: a `UNIQUE` constraint on the nullable `GuestToken` would have allowed one signed-in cart in total. Reference rows (roles, statuses, transitions, payment methods) and the configuration values arrive with the seeds.
- **The migration runner works** (`npm run db:migrate` and `db:verify`, in `db/runner`). It was verified against SQL Server 2022 with fixture scripts: a first run, a repeated run that changes nothing, an edited migration (rejected), a changed object without a version bump (rejected), a raised version (applied, with its extended property), a hand-edited procedure (`db:verify` fails) and a broken migration (rolled back and logged). No real migrations exist yet: V0001 to V0009 come next.
- **`npm run sql:test` runs tSQLt end to end.** `db/tests/scripts/run-tsqlt.ts` keeps `ShopCart_CI` on a throwaway server (`npm run sql:test:up`), installs tSQLt on top of whatever schema is there, runs the tests in `db/tests/tsqlt` writes `test-results/tsqlt-junit.xml` and uninstalls tSQLt again. After a migration plus two runs the migrated table was still there and neither the tSQLt schema nor its CLR assembly remained. It was verified on SQL Server 2022 with a passing run, a repeated run and a forced failure (exit code 1). The first class, `Test_Environment`, checks the pinned version, the CLR permission set, TRUSTWORTHY and the `_CI` name.
- **tSQLt is vendored** in `db/tests/tsqlt/install` at version 1.0.8083.3529. The files keep their Windows line endings, so `.gitattributes` marks them `-text`, and `npm run sql:lint` verifies them against `SHA256SUMS`, also in the Windows job. A clone with `core.autocrlf=true` kept all three checksums.

## Decisions confirmed

- The evaluator answered affirmatively to the `PendingPayment` question, so orders are created before they are paid ([ADR-0014](../adr/0014-order-created-as-pending-payment.md)). `SP_Orders_CreateOrder` is written as designed.

- The audit log actions (`Create`, `Update`, `Deactivate`, `StatusChange`) and the demo coupon codes (`WELCOME10`, `CAKES25`, `SOLDOUT`, `EXPIRED`) are fixed, so the Stage 2 seeds and the `AuditLog` constraint can be written without further questions ([reference values](../database/er-diagram.md#reference-and-seed-values)).

- The test accounts are fixed (administrator, operator and two customers on the reserved `.test` domain). Their passwords are generated into the local `.env` and never committed; the READMEs publish only the e-mail addresses ([test accounts](../operations/test-accounts.md)).

## Blockers

- None for development.
- **Calendar risk:** the roadmap gave one stage per day and Stage 2 has not started on its planned date. Protect the mandatory scope first (schema, critical procedures with their tests, the complete bank deposit flow, authentication, idempotency, IDOR and concurrency) and leave Recurrente and the extras for Delivery Phase 2.
