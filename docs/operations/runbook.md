# Runbook

## Start and stop

```bash
npm install
npm run up
npm run logs
npm run down
```

`npm run up` creates `.env` from `.env.example` with generated local secrets when it is missing, builds the images and waits until the services are healthy. The stack is published at `http://localhost:8080` (`EDGE_PORT`).

Default services: `db` (SQL Server 2022), `db-migrate` (the migration runner: applies the pending migrations, objects and seeds, and aligns the application login; it exits when done), `backend`, `frontend` and `nginx`. Optional profiles:

```bash
docker compose --profile payments-sandbox up -d
docker compose --profile quality up -d
docker compose --profile observability up -d
```

## Health checks

| Probe | Meaning |
|---|---|
| `GET /health/live` | The process answers; it does not check dependencies |
| `GET /health/ready` | The database is reachable (and, from Stage 2, the schema version is current). Answers 503 otherwise |

## Reset everything

```bash
docker compose down --volumes
npm run up
```

This deletes the SQL Server data and the payment proofs volumes.

## Common problems

| Symptom | Cause and fix |
|---|---|
| `db` never becomes healthy | Not enough memory. Give Docker Desktop at least 4 GB and keep `MSSQL_MEMORY_LIMIT_MB` at 2048 or higher |
| `db-migrate` fails on the password | `MSSQL_SA_PASSWORD` must have at least eight characters with upper case, lower case and digits. Delete `.env` and run `npm run up` again to regenerate it |
| `db-migrate` or `db:verify` stop with `COLLATION_MISMATCH` | The database was created with another collation (a volume from before ADR-0025, or an instance default). Recreate it: `docker compose down --volumes`, then `npm run up`. The collation of existing data cannot be changed in place |
| `/health/ready` answers 503 with `schema: outdated` | The database is behind the code. Run `docker compose run --rm db-migrate` (or `npm run db:migrate`); the backend recovers on the next probe without a restart. The log line `Database schema is behind the application` carries the current and required versions |
| `/health/ready` answers 503 with `schema: unknown` | The version could not be read: the database is down or `SP_System_GetSchemaVersion` does not exist yet. Run the migrations |
| The backend cannot log in after `.env` was regenerated | Run `docker compose run --rm db-migrate`: the runner sets the application login to the password in `.env` on every run |
| `db-migrate` reports `MIGRATION_DRIFT` or `OBJECT_VERSION_NOT_RAISED` | A migration was edited after it was applied, or an object changed without a higher header version. Revert the edit and write a new migration, or raise the version ([versioning](../database/versioning.md)) |
| `backend` restarts | Check `npm run logs`; an invalid environment variable makes the process stop with the variable name |
| Checksum differences on Windows | Line endings. `.gitattributes` forces LF; run `git add --renormalize .` |
| A container is unhealthy with `Connection refused` | Alpine resolves `localhost` to IPv6 while nginx listens on IPv4. Health checks use `127.0.0.1` |
| Port 8080 in use | Change `EDGE_PORT` in `.env` |
| Card payments missing | Expected without Recurrente credentials; only bank deposit is offered ([availability rule](../payments/availability-rule.md)) |

## Jobs and locks

Jobs run inside the API process. Each `SP_Jobs_*` procedure takes a session `sp_getapplock`, so running two replicas is safe: the second one answers `Skipped`. A request stuck `InProgress` for more than 60 seconds is considered abandoned.

| What you see | What it means |
|---|---|
| `Job ran` at `info` with `expiredOrders` or `releasedReservations` above zero | Normal: unpaid orders were cancelled and their stock returned |
| `Job failed` at `error`, repeated | The procedure raised an error (usually the database was unreachable). The job stays scheduled; read `GET /admin/system/jobs` for `lastError` and `consecutiveFailures` |
| `Reconciliation found discrepancies` at `error` | Money or stock does not add up. Read `GET /admin/system/reconciliation` and the audit log entry of module `Reconciliation` before anything else |
| Reservations never expire | `JOBS_ENABLED=false`, or the process cannot reach the database. To free them by hand: `EXEC dbo.SP_Jobs_ExpirePayments` |

To stop the jobs of one instance (for example while restoring a backup) set `JOBS_ENABLED=false` and restart it; the other replicas keep running them.

## Reconciliation

`VW_Reconciliation_Amounts` and `VW_Inventory_Reconciliation` must return zero rows. A daily job records any difference in the audit log; investigate it before anything else.

## Releasing

Tag with SemVer, build the images with the same tag, and keep `info.version` in the OpenAPI document aligned. Rollbacks are forward-only: ship a compensating migration.
