# ADR-0003: Own forward-only migration runner in Node

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The brief requires numbered, versioned SQL scripts that create the database reproducibly. Developers use Windows or Linux, and `sqlcmd` or bash scripts do not behave the same on both. Flyway would add Java and another image.

## Decision

Write a small Node/TypeScript runner (`db/runner`) using the `mssql` package. It applies pending migrations `V####`, re-runnable objects `R####` and idempotent seeds `S####`, each in its own transaction, records them in `SchemaVersion` and `ObjectVersions` with a SHA-256 checksum computed after normalising CRLF to LF, aborts when an applied migration changed (drift), and is itself idempotent so it can run on every compose start. Rollback is forward-only: a compensating migration fixes a mistake.

## Consequences

- The same script produces the same checksum on Windows and Linux (tested in CI on both).
- About 200 lines of code that the author can explain and change in a live defence.
- No automatic down migrations; the previous version of an object comes from the Git tag or `DdlHistory`.

## Alternatives considered

- Flyway or Liquibase: extra runtime and image, harder to modify live.
- `sqlcmd` shell scripts: not portable to Windows without extra tooling.

## Links

- [Design v3 §8 and D14](../design/source/DISENO_SHOPCART_v3.md)
- [ADR-0012](0012-versioning-of-sql-objects-and-expand-contract.md)
