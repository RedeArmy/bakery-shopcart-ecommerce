# Status

_Last updated: Wednesday 28 October 2026 (end of the Stage 0 and Stage 1 session)._

## Current stage

**Stage 1 complete. Stage 2 is next.** Delivery Phase 1 is due Monday 2 November 2026, 23:59.

## Done in the last session

- **Stage 0 (foundations):** monorepo with npm workspaces; ESLint, Prettier, cspell (en-GB), British spelling check, README sync check, commitlint, husky; `dependency-cruiser` rules with a self-test that proves a deliberate violation is detected; backend skeleton (Express, health endpoints, executor, module layout); frontend skeleton (Vite, React, i18n); database folders and an SQL Server init script; Docker Compose with profiles; GitHub Actions workflow.
- **Stage 1 (documentation and conventions):** 24 ADRs, architecture, database, API, payments, quality and operations documents, glossary, progress tracking and the bilingual README.
- Acceptance run: `npm run lint`, `typecheck`, `test`, `arch:check` and `spell` pass; `docker compose config` is valid for the default and all profiles; backend and frontend builds succeed.

## Next

1. Done: `npm run up` verified on Windows with Docker Desktop. All five services are healthy and `/health/live`, `/health/ready` and `/` answer 200 through nginx.
2. Stage 2: migration runner, core tables V0001 to V0009, seeds and the tSQLt spike.
3. Send the evaluator the `PendingPayment` question ([open question 4](open-questions.md)).

## Blockers

- None for development. None.
