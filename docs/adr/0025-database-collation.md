# ADR-0025: Database collation Latin1_General_100_CI_AS_SC

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

The collation decides which text values count as equal and how text sorts. Until now it was whatever the SQL Server instance happened to use: `SQL_Latin1_General_CP1_CI_AS` in the Linux image, but the default on a Windows instance follows the system locale (a Guatemalan Spanish installation would get `Modern_Spanish_CI_AS`). The same migrations would therefore give different results for unique e-mail addresses, unique names and ordering depending on where they ran. A collation cannot be corrected afterwards on a database that already has data, because existing columns keep the one they were created with. The technical audit recorded this as debt D-04.

The shop stores text only as `NVARCHAR`, writes Spanish product names with accents and enters free text (the inscription of a cake) that can include emoji.

## Decision

We will create the database with the explicit collation **`Latin1_General_100_CI_AS_SC`** and treat any other collation as an error.

- **CI (case insensitive):** `Ana@x.test` and `ana@x.test` are the same e-mail address, and category names do not repeat because of capitalisation.
- **AS (accent sensitive):** `Té` and `Te` are different values, so a unique name is never refused because of an accent. Searching without accents is a query concern: the search procedure will add an explicit `COLLATE Latin1_General_100_CI_AI_SC`.
- **SC (supplementary characters):** an emoji counts as one character, so a length limit on an inscription means what the customer sees.
- **100:** the current sort rules, not the legacy SQL collations.

The migration runner creates the database with this collation and, on every `migrate` and `verify`, stops with `COLLATION_MISMATCH` if the database uses another one. The containers that the repository starts (compose, the tSQLt server and the CI service) set `MSSQL_COLLATION` to the same value, so the server and `tempdb` match. When they do not (an external server) the runner only warns, and temporary tables with text columns must declare `COLLATE DATABASE_DEFAULT`.

## Consequences

- The behaviour of unique text and of sorting is the same on every machine, and it is tested (`Test_Environment`, `Test_Constraints`).
- A database or volume created before this decision has the old collation and is refused. Locally it is recreated with `docker compose down --volumes`; no real data exists yet, which is why this is the cheapest moment to decide.
- A temporary table takes the collation of `tempdb`. With matching servers there is no conflict; on a foreign server the `COLLATE DATABASE_DEFAULT` rule is the safeguard, and the seed tests already follow it.
- The collation is repeated in four places (the runner, `docker-compose.yml`, `docker-compose.sql-test.yml` and the CI workflow); a unit test fails if they diverge.
- `MSSQL_COLLATION` only takes effect when the server is first initialised, so it never changes an existing volume.

## Alternatives considered

- **Keep the instance default:** the behaviour depends on where the database is created, which is the problem.
- **`SQL_Latin1_General_CP1_CI_AS`, the Linux image default:** deterministic here, but a legacy SQL collation without supplementary characters, and still wrong on an instance that sets another default.
- **`Latin1_General_100_CI_AI_SC` (accent insensitive for everything):** friendlier search, but it merges values that differ in an accent and turns a unique constraint into a surprise; the same search is available per query.
- **`Modern_Spanish_CI_AS`:** correct Spanish sort order for `ñ` but ties the schema to one language, and `Latin1_General` already sorts `ñ` after `n`.
- **A UTF-8 collation (`_UTF8`):** only helps `VARCHAR` columns, and the project uses `NVARCHAR` throughout.

## Links

- [Technical audit, D-04](../quality/technical-audit-stage-2.md)
- [Naming standard](../database/naming-standard.md)
- [ADR-0003](0003-own-forward-only-migration-runner-in-node.md), [ADR-0023](0023-sql-tests-with-tsqlt-in-ci-only.md)
