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
| `db-migrate` stops with `SERVER_SHUT_DOWN` | SQL Server shut itself down while the database was being created: it was still finishing the default collation change of its first start (error 3434). The container does not come back by itself and the volume is half-initialised. Run `docker compose down --volumes`, then `npm run up`. The runner waits for that change to finish and confirms it twice, so this should not happen; if it does, report it with the `db` logs |
| `db-migrate` stops with `SEED_ADMIN_PASSWORD is empty` (or the operator or customer one) | `SEED_DEMO_DATA` is `true` but the password was not generated. Run `npm run up`: it completes an older `.env` without touching its other values |
| A test account does not accept its password | The account was created with an earlier password: the seed never overwrites an existing account. Run `docker compose down --volumes` and `npm run up` to create the accounts again with the passwords in `.env` |
| `db:verify` says `does not have READ_COMMITTED_SNAPSHOT on` | The database was created or restored without the option. Run `npm run db:migrate`: it waits up to 30 seconds for the other sessions and applies it |
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

## Database operations

Run these in `sqlcmd` or any client connected to the `ShopCart` database as an administrator. The performance figures behind them are in [performance](performance.md).

### Backups and recovery

A new database starts in the `FULL` recovery model, and a `FULL` database whose transaction log is never backed up never truncates it: the log grows until the disk is full. Pick one on purpose.

| Environment | What to do |
|---|---|
| Local and demonstration | `ALTER DATABASE ShopCart SET RECOVERY SIMPLE;` The log truncates by itself; you can restore only to the last full backup |
| Production | Keep `FULL`. Full backup every day, differential every few hours, log backup every 15 minutes. Test a restore every month on another server |

After any restore, run `docker compose run --rm db-migrate` (it applies what the restored copy lacks and realigns the application login) and then `npm run db:verify`. Both are idempotent.

### Maintenance

Automatic statistics are on. The rest is manual on purpose; nothing here runs by itself.

| Task | When | How |
|---|---|---|
| Rebuild fragmented indexes | Weekly | List them with the query below, then `ALTER INDEX <name> ON dbo.<table> REORGANIZE;` (`REBUILD` above 30 % where the edition allows `ONLINE = ON`) |
| Refresh statistics of the big tables | Monthly, and after a bulk load | `UPDATE STATISTICS dbo.Orders WITH FULLSCAN;` for `Orders`, `OrderLines`, `AuditLog`, `RefreshTokens`, `InventoryMovements` |
| Check the data pages | Monthly | `DBCC CHECKDB (ShopCart) WITH NO_INFOMSGS;` |

```sql
SELECT OBJECT_NAME(ips.object_id) AS table_name, i.name AS index_name, CAST(ips.avg_fragmentation_in_percent AS DECIMAL(5,1)) AS fragmentation
FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') AS ips
JOIN sys.indexes AS i ON i.object_id = ips.object_id AND i.index_id = ips.index_id
WHERE ips.page_count >= 1000 AND ips.avg_fragmentation_in_percent > 30
ORDER BY fragmentation DESC;
```

### Data retention

The job `purgeExpired` (daily) deletes in batches, so it never holds a lock for long. The periods are rows of `Configuration` ([reference](configuration-reference.md)); a value that is missing, not a number or below 1 falls back to the default.

| What is deleted | Default | Rule |
|---|---|---|
| Idempotency keys | 24 h (`IdempotencyKeyHours`) | Past their expiry, including the ones abandoned in progress |
| Refresh tokens | 30 days (`RetentionRefreshTokenDays`) | A whole family, once its last token expired that long ago. Never part of a family: a token still valid keeps its family and the reuse detection |
| Received webhooks | 90 days (`RetentionWebhookDays`) | |
| Guest carts | 30 days (`RetentionGuestCartDays`) | Without activity; the carts of customers are never purged |
| Reservations | 90 days (`RetentionReservationDays`) | Released or expired and never linked to an order |
| DDL history | 365 days (`RetentionDdlHistoryDays`) | |

Not purged, by design: the audit log, the inventory ledger, the financial ledger and the status histories are append-only. Archiving them is a business decision; do it by date range into another database, never with `DELETE` (the triggers refuse it).

### Isolation, blocking and deadlocks

The database runs with `READ_COMMITTED_SNAPSHOT`: a reader sees the last committed version of a row and never waits for a writer. Writers still wait for each other, and every procedure that decides on data takes `UPDLOCK` first. `npm run db:verify` fails if the option is off.

```sql
-- Who is waiting for whom right now
SELECT r.session_id, r.blocking_session_id, r.wait_type, r.wait_time, LEFT(t.text, 120) AS statement
FROM sys.dm_exec_requests AS r CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) AS t
WHERE r.blocking_session_id <> 0;
```

```sql
-- The last deadlocks, with their graphs (the system_health session records them without any setup)
SELECT TOP (10) n.x.value('(@timestamp)[1]', 'datetime2') AS occurred_at, n.x.query('.') AS graph
FROM (SELECT CAST(st.target_data AS XML) AS d FROM sys.dm_xe_session_targets AS st
      JOIN sys.dm_xe_sessions AS s ON s.address = st.event_session_address
      WHERE s.name = N'system_health' AND st.target_name = N'ring_buffer') AS t
CROSS APPLY t.d.nodes('RingBufferTarget/event[@name="xml_deadlock_report"]') AS n(x)
ORDER BY occurred_at DESC;
```

A deadlock victim is retried twice by the backend (`executeProcedure`) with a short random delay, so one deadlock in the log is normal and a stream of them is a defect to report with its graph.

Row versions live in `tempdb`. Watch them if a transaction stays open for a long time:

```sql
SELECT CAST(SUM(version_store_reserved_page_count) * 8 / 1024.0 AS DECIMAL(18,1)) AS version_store_mb
FROM tempdb.sys.dm_db_file_space_usage;
SELECT COUNT(*) AS open_snapshot_transactions FROM sys.dm_tran_active_snapshot_database_transactions;
```

### Slow queries

Query Store is on and keeps the plans and the runtime of every query. To find what costs the most:

```sql
SELECT TOP (10) q.query_id, SUM(rs.count_executions) AS executions,
       CAST(SUM(rs.avg_duration * rs.count_executions) / 1000.0 AS DECIMAL(18,1)) AS total_ms, LEFT(qt.query_sql_text, 100) AS statement
FROM sys.query_store_query AS q
JOIN sys.query_store_query_text AS qt ON qt.query_text_id = q.query_text_id
JOIN sys.query_store_plan AS p ON p.query_id = q.query_id
JOIN sys.query_store_runtime_stats AS rs ON rs.plan_id = p.plan_id
GROUP BY q.query_id, qt.query_sql_text
ORDER BY total_ms DESC;
```

After a change to a list or a report, repeat the measurement with `npm run sql:bench`.

### Growth

The biggest tables at 50,000 orders are `RefreshTokens` and `AuditLog`. Size per table:

```sql
SELECT TOP (10) OBJECT_NAME(object_id) AS table_name, SUM(row_count) AS rows, CAST(SUM(used_page_count) * 8 / 1024.0 AS DECIMAL(18,1)) AS used_mb
FROM sys.dm_db_partition_stats
WHERE index_id IN (0, 1) AND OBJECTPROPERTY(object_id, 'IsUserTable') = 1
GROUP BY object_id ORDER BY used_mb DESC;
```

## Reconciliation

`VW_Reconciliation_Amounts` and `VW_Inventory_Reconciliation` must return zero rows. A daily job records any difference in the audit log; investigate it before anything else.

## Releasing

Tag with SemVer, build the images with the same tag, and keep `info.version` in the OpenAPI document aligned. Rollbacks are forward-only: ship a compensating migration.
