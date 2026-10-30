# Database: migration runner

**Responsibility:** Forward-only Node/TypeScript runner with checksums and drift detection.

**May contain:** The runner and its Dockerfile.

**Must not contain:** Application code.

**Governing ADR:** [0003](../../docs/adr/0003-own-forward-only-migration-runner-in-node.md)

## Commands

```bash
npm run db:migrate
```

```bash
npm run db:verify
```

`db:migrate` creates the database if it is missing, takes an application lock so two runners cannot overlap, creates the control tables and applies, in this order, the pending `V` migrations, the new or changed `R` objects and the `S` seeds. Every script runs in its own transaction; a failed one is rolled back and logged with `IsSuccessful = 0`.

`db:verify` exits with 1 when a script is pending, a migration was edited, or an object was changed outside the runner. Exit codes of both commands: 0 correct, 1 a problem in the scripts or the database, 2 a failure of the tool itself.

## Rules it enforces

- An applied migration is immutable: a different checksum aborts the run (`MIGRATION_DRIFT`), as does a missing file or a new migration numbered below an applied one.
- A changed `R` object must raise the `Version` of its header (`OBJECT_VERSION_NOT_RAISED`, `OBJECT_VERSION_LOWERED`), and its header must declare `dbo.<file name>`.
- Checksums are computed after removing the byte order mark and normalising line endings to LF, so Windows and Linux agree.
- Seeds run again only when their content changes, so they must be idempotent.

Configuration variables are in the [configuration reference](../../docs/operations/configuration-reference.md). The logic is split into pure modules (`plan.ts`, `scripts.ts`, `header.ts`), which the unit tests cover, and `database.ts`, which talks to SQL Server.
