# Runbook

## Start and stop

```bash
npm install
npm run up
npm run logs
npm run down
```

`npm run up` creates `.env` from `.env.example` with generated local secrets when it is missing, builds the images and waits until the services are healthy. The stack is published at `http://localhost:8080` (`EDGE_PORT`).

Default services: `db` (SQL Server 2022), `db-migrate` (creates the database and the application login; replaced by the runner in Stage 2), `backend`, `frontend` and `nginx`. Optional profiles:

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
| `backend` restarts | Check `npm run logs`; an invalid environment variable makes the process stop with the variable name |
| Checksum differences on Windows | Line endings. `.gitattributes` forces LF; run `git add --renormalize .` |
| A container is unhealthy with `Connection refused` | Alpine resolves `localhost` to IPv6 while nginx listens on IPv4. Health checks use `127.0.0.1` |
| Port 8080 in use | Change `EDGE_PORT` in `.env` |
| Card payments missing | Expected without Recurrente credentials; only bank deposit is offered ([availability rule](../payments/availability-rule.md)) |

## Jobs and locks

Jobs run inside the API process and take `sp_getapplock`, so running two replicas is safe. A request stuck `InProgress` for more than 60 seconds is considered abandoned.

## Reconciliation

`VW_Reconciliation_Amounts` and `VW_Inventory_Reconciliation` must return zero rows. A daily job records any difference in the audit log; investigate it before anything else.

## Releasing

Tag with SemVer, build the images with the same tag, and keep `info.version` in the OpenAPI document aligned. Rollbacks are forward-only: ship a compensating migration.
