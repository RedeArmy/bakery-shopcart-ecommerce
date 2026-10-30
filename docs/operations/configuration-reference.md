# Configuration reference

All configuration comes from environment variables, validated with zod at start-up (`backend/src/platform/config`). A blank value means **not configured**. `.env.example` is versioned with empty secrets; `npm run up` generates local ones. Never commit a real value.

| Variable | Default | Description |
|---|---|---|
| `MSSQL_SA_PASSWORD` | generated | Password of the `sa` user in the SQL Server container |
| `MIGRATION_HOST` | `DB_HOST` | Host the migration runner connects to; set it to `localhost` when running from the host, because `DB_HOST` in `.env` is the compose service name |
| `MIGRATION_PORT` | `DB_PORT` | Port the migration runner connects to |
| `MIGRATION_USER` | `sa` | Login with DDL permissions used by the runner |
| `MIGRATION_PASSWORD` | `MSSQL_SA_PASSWORD` | Password of the migration login |
| `DB_SCRIPTS_ROOT` | `db` | Folder with `migrations`, `objects` and `seed` (tests point it at fixtures) |
| `SQL_TEST_PASSWORD` | `MSSQL_SA_PASSWORD` | Password of the `sa` user of the throwaway tSQLt server (`CI_SA_PASSWORD` in CI) |
| `SQL_TEST_HOST` | `localhost` | Host of the tSQLt server; anything else needs `SQL_TEST_ALLOW_REMOTE=true` |
| `SQL_TEST_PORT` | `14333` | Port of the tSQLt server (`docker-compose.sql-test.yml` publishes it on the loopback only) |
| `SQL_TEST_DATABASE` | `ShopCart_CI` | Test database, created if missing and kept between runs (tSQLt is uninstalled after each run); the name must end in `_CI` |
| `SQL_TEST_REPORT` | `test-results/tsqlt-junit.xml` | Where the JUnit XML is written |
| `MSSQL_MEMORY_LIMIT_MB` | `2048` | Memory ceiling of SQL Server |
| `DB_HOST` | `db` (compose) | Database host |
| `DB_PORT` | `1433` | Database port |
| `DB_NAME` | `ShopCart` | Database name |
| `DB_APP_USER` | `shopcart_app` | Application login: `EXECUTE` only |
| `DB_APP_PASSWORD` | generated | Application login password |
| `NODE_ENV` | `development` | `development`, `test` or `production` |
| `PORT` | `3000` | API port inside the container |
| `LOG_LEVEL` | `info` | pino level |
| `JWT_ACCESS_SECRET` | generated | Signing secret of access tokens |
| `JWT_REFRESH_PEPPER` | generated | Pepper for the SHA-256 hash of refresh tokens |
| `ACCESS_TTL` | `15m` | Access token lifetime |
| `REFRESH_TTL` | `7d` | Refresh token lifetime |
| `CORS_ORIGINS` | `http://localhost:8080` | Comma-separated allow-list |
| `APP_PUBLIC_URL` | `http://localhost:8080` | Public shop URL (gateway `success_url` and `cancel_url`) |
| `REQUIRED_SCHEMA_VERSION` | blank | Minimum schema version required at start-up (set from Stage 2) |
| `PAYMENT_PROOFS_DIR` | `/data/payment-proofs` | Private directory for proofs (named volume) |
| `PAYMENT_PROOF_MAX_BYTES` | `5242880` | Maximum proof size (5 MB) |
| `RECURRENTE_PUBLIC_KEY` | blank | `pk_test_…` or `pk_live_…`; blank disables card payments |
| `RECURRENTE_SECRET_KEY` | blank | `sk_test_…` or `sk_live_…`; blank disables card payments |
| `RECURRENTE_WEBHOOK_SECRET` | blank | `whsec_…`; required with live keys |
| `RECURRENTE_BASE_URL` | `https://app.recurrente.com/api` | Point it at the simulator in the `payments-sandbox` profile |
| `PAYMENTS_CARD_ENABLED` | `true` | `false` forces deposit only |
| `SEED_DEMO_DATA` | `true` locally | Creates the demo accounts and data; never set it in production (Stage 2) |
| `SEED_ADMIN_PASSWORD` | generated | Password of `admin@shopcart.test`, never committed (Stage 2) |
| `SEED_OPERATOR_PASSWORD` | generated | Password of `operator@shopcart.test`, never committed (Stage 2) |
| `SEED_CUSTOMER_PASSWORD` | generated | Password of the customer accounts, never committed (Stage 2) |
| `EDGE_PORT` | `8080` | Port published by nginx on the host |
| `VITE_API_BASE_URL` | `/api/v1` | Frontend API base (public, build time) |

Rate-limit variables per policy group are added with the rate-limit module (Stage 5) and documented here.

## Business configuration (database table `Configuration`)

| Key | Seed value | Meaning |
|---|---|---|
| `ReservationMinutes` | `15` | Checkout reservation window |
| `DepositReservationHours` | `24` | Maximum deposit window |
| `MinDepositHours` | `2` | Below this the deposit is not offered |
| `RejectionGraceHours` | `12` | Extra time after a rejection |
| `MaxDepositAttempts` | `3` | Proof attempts per order |
| `AbandonedCartHours` | `24` | Inactivity before a cart counts as abandoned |
| `ShippingCost` | `25.00` | Flat shipping |
| `FreeShippingFrom` | `300.00` | Free shipping threshold |
| `VatRate` | `12` | VAT percentage, included in prices |
| `IdempotencyKeyHours` | `24` | Retention of idempotency keys |
