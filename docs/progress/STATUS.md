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
4. **Stage 2, starting with the tSQLt spike** (the first risk in the [risk register](risk-register.md)), then the migration runner, tables V0001 to V0009 and the seeds. Use one small pull request per block. When `sql-tests` and `integration` are enabled, add them to the required checks of the ruleset.

## Decisions confirmed

- The evaluator answered affirmatively to the `PendingPayment` question, so orders are created before they are paid ([ADR-0014](../adr/0014-order-created-as-pending-payment.md)). `SP_Orders_CreateOrder` is written as designed.

- The audit log actions (`Create`, `Update`, `Deactivate`, `StatusChange`) and the demo coupon codes (`WELCOME10`, `CAKES25`, `SOLDOUT`, `EXPIRED`) are fixed, so the Stage 2 seeds and the `AuditLog` constraint can be written without further questions ([reference values](../database/er-diagram.md#reference-and-seed-values)).

## Blockers

- None for development.
- **Calendar risk:** the roadmap gave one stage per day and Stage 2 has not started on its planned date. Protect the mandatory scope first (schema, critical procedures with their tests, the complete bank deposit flow, authentication, idempotency, IDOR and concurrency) and leave Recurrente and the extras for Delivery Phase 2.
