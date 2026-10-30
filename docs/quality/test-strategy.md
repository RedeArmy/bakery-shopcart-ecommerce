# Test strategy

| Type | What it covers |
|---|---|
| Unit (Vitest) | Money and rounding, services with fake ports and a fixed clock, Svix verifier (valid, invalid, expired, several signatures), `PaymentMethodsRegistry` (no keys, only public key, `live` without webhook secret, flag off, probe 401), file magic bytes |
| **SQL unit (tSQLt)** | Money functions, state and immutability triggers, permissions, critical procedures and reconciliation; catalogue in [sql-testing-tsqlt](sql-testing-tsqlt.md) |
| API integration (real SQL Server, over HTTP) | `npm run test:integration -w backend` runs 14 flows with supertest: catalogue, cart, checkout, deposit with proof, review, delivery, return, refund, cancellation, rate limit and the IDOR cases (another customer's order, payment, proof and address answer 404). It skips itself without `SQL_TEST_HOST` and leaves its data in the throwaway database |
| Integration (real SQL Server) | Each critical procedure; valid and invalid order and payment transitions; idempotent `ConfirmPayment`; `UX_Payments_OneApproved`; `UX_PaymentDeposits_Reference` with rejection and correction; expiry that releases the reservation and voids the coupon without a ledger entry; an orphan payment creates a refund; immutable audit log and ledger; versioning |
| **Concurrency** | 100 parallel `POST /checkout/start` for 1 unit → exactly 1 success. 50 simultaneous uses of a coupon limited to 10 → exactly 10. 10 identical parallel approvals of the same deposit → 1 inventory exit, 1 ledger charge. Approve vs expire → one winner and a consistent state. With 1 unit and a deposit under review, another customer cannot reserve it |
| **Idempotency** | The same `Idempotency-Key` five times in parallel on `checkout/confirm` → 1 order and 1 payment |
| **IDOR** | Customer A requests an order, cart, address or proof of B → 404, never 200 |
| **File security** | An `.exe` renamed `.png` → 415. A 6 MB file → 413. The same file in another order → 422 |
| **Rate limit** | The sixth login in a minute → 429 with `Retry-After` |
| **Payment configuration** | With an empty `.env`, `GET /checkout/payment-methods` returns only `BANK_DEPOSIT` and the UI shows no card; requesting `CARD` → 422 |
| Contract | Schemathesis against `openapi.yaml`, multipart included |
| End to end (Playwright, Phase 2) | Buy with a deposit: upload, reject, re-upload, approve. With the simulator: buy with a card |
| Reconciliation | `VW_Inventory_Reconciliation` and `VW_Reconciliation_Amounts` empty after load tests |

## Money guard rails

Property tests with `fast-check` (allocation sums, parts within one cent, `Base + Vat = Total`, round trips, refunds close exactly), golden values from the [worked example](../database/money-handling.md#worked-example-cent-by-cent), and a **differential test** that compares the TypeScript oracles with the SQL functions over random inputs.

## Where tests live

| Path | Content |
|---|---|
| `backend/tests/unit` | Fast tests, no I/O |
| `backend/tests/integration` | Real SQL Server through Testcontainers |
| `backend/tests/concurrency` | Parallel scenarios |
| `backend/tests/contract` | Schemathesis |
| `frontend/tests/unit`, `frontend/tests/e2e` | Vitest and Playwright |
| `db/tests/tsqlt` | tSQLt classes (CI only) |
| `tools/scripts/tests` | Spelling and README checks |

## Order of execution

SQL lint → migrate → `db:verify` → tSQLt → integration and concurrency → differential TS↔SQL → reconciliation with zero rows. Any red step blocks the merge. Tooling (Sonar, observability, Playwright) does not start before the critical procedures and their tests are green.

## Telemetry used by tests and operations

Logs are JSON from `pino` with redaction; the `requestId` propagates to `AuditLog.IDCorrelation`. Simple metrics: latency per route, confirmed checkouts, deposits to review and their age, reservations released per cycle, exhausted coupons, 429 responses, retried deadlocks.
