# ADR-0023: SQL tests with tSQLt in CI only

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Critical logic lives in procedures, functions and triggers, so it must be tested in the database. tSQLt requires CLR, which must never reach the delivered database.

## Decision

Three complementary layers: tSQLt unit tests for functions, views, triggers, permissions and procedure logic (each test rolls back); Vitest with Testcontainers for concurrency and idempotency through the real executor; and differential tests comparing TypeScript and SQL money functions. CI creates `ShopCart_CI`, migrates from scratch, runs `db:verify` and only then installs tSQLt. A guard test and an image check verify the delivered database has no `tSQLt` schema and `clr enabled = 0`. `FakeTable` is used only to isolate logic; constraints and triggers are tested on real tables. `sp-coverage.ts` fails CI when a critical procedure has no test. Plan B if tSQLt cannot install on an environment: the same assertions as Vitest tests through the executor.

## Consequences

- Critical procedures are not finished without a test.
- A spike on day one validates tSQLt on Linux and Docker Desktop (WSL2).

## Alternatives considered

- API-level tests only: cannot isolate a single function or trigger quickly.

## Links

- [Design v3 §16.6](../design/source/DISENO_SHOPCART_v3.md)
