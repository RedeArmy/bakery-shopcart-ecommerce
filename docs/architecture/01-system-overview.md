# 01 · System overview

## What is evaluated

| Criterion | Points | Reading |
|---|---|---|
| Data model and integrity | 20 | Constraints, transactions, indexes, migrations, naming standard (`SP_`, `VW_`, `FU_`, `ID<Name>`) |
| Business logic | 20 | Edge cases: last unit, double click, concurrent coupon, partial return, rounding |
| Technical defence | 20 | Explain decisions and change code live |
| Backend | 15 | Layers, validation, errors, security, API documentation |
| Frontend | 15 | Role-based UI, loading/empty/error states, transparent refresh, responsive |
| Environment and docs | 10 | README, seeds, decisions, progressive commits |

## Constraints and what they imply

| Constraint | Implication |
|---|---|
| Node 26, TypeScript `strict`, Express | No NestJS or Fastify; manual dependency injection in `composition-root.ts` |
| Data access only through stored procedures, no ORM, no SQL in the backend | Repositories are thin adapters over one executor. All SQL lives in `db/` |
| Numbered SQL scripts written by the participant | Own migration runner with checksums (ADR-0003) |
| `SP_`, `VW_`, `FU_`, `ID<Name>` naming | Automatic SQL lint in CI |
| No `FLOAT` or `REAL` for money | `DECIMAL(18,2)` in tables, integer cents in calculations (ADR-0019) |
| Everything presented must run in the delivered environment | The default compose path is minimal and has no Recurrente credentials: deposit only |
| SQL injection is penalised | Typed parameters; dynamic SQL only through `sp_executesql` |

The brief does not mention payment gateways. Bank deposit and Recurrente are a differentiator and must not put the mandatory scope at risk.

## The six business concerns and their mechanism

| Concern | Mechanism |
|---|---|
| Never oversell the last unit | Atomic conditional `UPDATE` plus `CHECK (ReservedStock <= OnHandStock)` |
| Respect the price the customer saw | Snapshot in `OrderLines` plus immutability triggers |
| No duplicate orders or charges | `Idempotency-Key` plus `UNIQUE` indexes; one open attempt and one approved payment per order; deduplicated webhooks |
| Sales and abandoned carts without manual reports | Views and table-valued functions |
| Traceability of changes | `AuditLog` written inside each procedure, immutable by trigger and `DENY` |
| Inventory traceability | Ledger with resulting balance and a reconciliation view |

## Non-functional requirements

| NFR | Target |
|---|---|
| Performance | Lists and reports p95 under 1 s with the seed (about 60 products, 5 000 orders) |
| Concurrency | 0 oversales with 100 simultaneous buyers of 1 unit |
| Integrity | Every multi-table operation is atomic (`SET XACT_ABORT ON`) |
| Security | Short JWT, rotated refresh token, password hash, CORS, Helmet, typed parameters, rate limiting, private proofs |
| Portability | `docker compose up` on a clean Windows or Linux machine without manual steps |
| Traceability | Audit log, inventory ledger, order and payment status history, schema versioning |

Capacity assumptions: about 3 000 active users a day, 400 orders a day (peak ×10), 30 checkouts a minute, 100 read requests a second for the catalogue at peak, about 440 000 ledger rows a year. One SQL Server instance and two API replicas are enough; the difficulty is correctness under concurrency, not volume.

## Scope levels

| Level | Content |
|---|---|
| 1 · mandatory | The nine functional modules, schema with constraints and triggers, auth with JWT and rotating refresh, tenant isolation (IDOR), idempotency, minimal rate limiting on `/auth/*`, complete bank deposit, concurrency/idempotency/IDOR/deposit tests, central error handling, zod validation, Swagger, README, progressive commits |
| 2 · low-risk differentiators | Contract-first OpenAPI with generated client, ADRs, CI, Testcontainers and tSQLt, basic telemetry, multi-stage Docker, optional SonarQube, full database versioning, Recurrente card payments (Delivery Phase 2) |
| 3 · only when 1 and 2 are closed | SSE dashboard, Excel/PDF export, report cache, remaining rate-limit policies, Redis adapter, OpenTelemetry with Grafana, Playwright, k6, transactional outbox, payment method switching, automatic refunds, administrable bank accounts |
| Left out on purpose | Kubernetes, microservices, CQRS with buses, event sourcing, Flyway |

## Delivery phases

| Delivery Phase 1 (Mon 2 Nov, 23:59) | Delivery Phase 2 (Mon 9 Nov, 23:59) |
|---|---|
| Whole schema, including payment tables and states | Complete frontend (including deposit and review queue) |
| Procedures for the nine modules and the deposit | Recurrente adapter, webhook, verification, reconciliation |
| Backend slices, auth, idempotency, `/auth/*` rate limit | Recurrente simulator (`payments-sandbox`) |
| Proof upload, review queue, approve and reject | Payment method switching and refunds |
| Expiry jobs, tests, README, ADRs | SonarQube, Schemathesis, extras |

## Decisions at a glance

The thirty design decisions (D1 to D30) are summarised in the ADR index. The ones that shape everything: modular monolith (ADR-0001), rules in the database (ADR-0002), order created as `PendingPayment` (ADR-0014), half-even integer money (ADR-0019) and British English with Spanish comments (ADR-0024).
