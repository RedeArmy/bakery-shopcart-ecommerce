# ADR-0012: Versioning of SQL objects and expand/contract

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Stored procedures, views, functions and triggers change often. The team must know which version runs, detect manual edits and evolve contracts without breaking running code.

## Decision

Every programmable object carries a header with a semantic version, change description and compatibility notes. The runner records versions in `ObjectVersions` and writes them as `EXTENDED PROPERTY`. A changed `R####` file without a higher version is rejected. A database DDL trigger records manual changes in `DdlHistory`, and `npm run db:verify` compares each `OBJECT_DEFINITION` with its checksum. Compatible changes (new parameter with a default) raise the minor version; incompatible ones follow expand/contract with a new process name, never a `_v2` suffix. The backend declares `REQUIRED_SCHEMA_VERSION` and `/health/ready` fails when the database is behind.

## Consequences

- Production versions are queryable through the database and the endpoint `/api/v1/admin/system/version`.
- Obsolete objects are removed by a later migration.

## Alternatives considered

- Unversioned objects: no way to detect drift or explain what runs where.

## Links

- [Design v3 §8.3 to §8.6](../design/source/DISENO_SHOPCART_v3.md)
- [ADR-0003](0003-own-forward-only-migration-runner-in-node.md)
