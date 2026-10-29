# ADR-0002: Critical rules in stored procedures and CHECK constraints

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The challenge mandates data access exclusively through stored procedures, forbids an ORM and inline SQL, and asks that critical rules are also protected in the database. Stock, coupons, order creation, payment approval and state transitions need atomicity under concurrency.

## Decision

Every rule that requires atomicity lives in a stored procedure backed by `CHECK`, `UNIQUE` and filtered unique indexes, and by triggers for state transitions and immutability. The backend validates first to produce good messages and orchestrates; the database has the final word. The application login has `GRANT EXECUTE` and `DENY SELECT, INSERT, UPDATE, DELETE` on the schema, and every parameter is typed.

## Consequences

- Overselling, double charges and invalid transitions are impossible even if a procedure or the middleware has a bug.
- Business logic is split between SQL and TypeScript, so each critical procedure needs a tSQLt test and an integration test.
- Repositories are thin adapters over one executor (`execute-procedure.ts`) that maps error codes 50400, 50404, 50409 and 50422 to HTTP.

## Alternatives considered

- Rules only in TypeScript: cannot guarantee atomicity across instances and violates the challenge constraints.
- An ORM: forbidden by the brief.

## Links

- [Design v3 §3.3, §6.3 and §7.6](../design/source/DISENO_SHOPCART_v3.md)
