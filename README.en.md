# ShopCart · Pastelería

🇬🇹 Versión en español: [README.md](README.md) <!-- spelling-ignore -->

A production-grade e-commerce platform for a bakery, built for the **Tech Challenge 360 · ShopCart Challenge (Grupo Pentandra)**. It has a catalogue, a cart, coupons, a checkout that reserves the stock for 15 minutes, a **bank deposit** payment simulated end to end (proof, review, rejection and retry), orders and returns, a sales dashboard and an audit log.

Mandatory stack: **SQL Server 2019+ (stored procedures only) · Node 26 + TypeScript `strict` + Express · React 18 + TypeScript**. Delivery dates: **Phase 1 (database and backend) Monday 2 November 2026, 23:59** and **Phase 2 (frontend and complete project) Monday 9 November 2026, 23:59**.

**Status:** both phases are complete. Phase 1 can be verified in minutes with a Postman collection (section 8) and Phase 2, the frontend, covers the shop and the administration by role (section 14).

## 1. The scenario

A chain of shops sells only in its physical stores and wants to sell online. Customers browse the catalogue (cakes, cupcakes, cookies, sweet bread, cold desserts and seasonal items), fill a cart, apply coupons, choose an address and a delivery date, pay and follow their order. The internal team prepares and dispatches the orders, controls the stock and analyses the sales. Amounts are in quetzales and the published prices include the 12 % VAT.

The business has six concrete concerns and each one has a mechanism:

| Concern | Mechanism |
|---|---|
| Never sell the last unit twice | Atomic conditional `UPDATE` plus `CHECK (ReservedStock <= OnHandStock)` |
| Honour the price the customer saw | Price copy in `OrderLines` and immutability triggers |
| No duplicate orders or charges | `Idempotency-Key` plus unique indexes |
| Sales and abandonment without manual reports | Views and table functions |
| Traceability of changes | `AuditLog` written inside each procedure |
| Traceability of inventory | Movement ledger with the resulting balance |

## 2. Requirement coverage

The nine modules of the brief are built end to end: the database, the backend and their screen in the frontend. The column of the table says what the database and the API cover; the screens by role are in section 14.

| Requirement | Phase 1 (database and API) | Where it is solved |
|---|---|---|
| RF-01 Authentication and roles | Complete | [Security](docs/architecture/05-security.md) |
| RF-02 Catalogue | Complete | [Procedure catalogue](docs/database/stored-procedure-catalogue.md) |
| RF-03 Inventory and ledger | Complete | [ADR-0007](docs/adr/0007-stock-reservation-as-expiring-counter.md) |
| RF-04 Cart | Complete | [ADR-0013](docs/adr/0013-cart-with-absolute-quantities.md) |
| RF-05 Coupons | Complete | [Procedure catalogue](docs/database/stored-procedure-catalogue.md) |
| RF-06 Checkout and payment | Complete (simulated payment) | [Payments](docs/payments/overview.md) |
| RF-07 Orders and returns | Complete | [State machines](docs/architecture/04-state-machines.md) |
| RF-08 Dashboard and reports | Complete, with its charts in the frontend | [ADR-0009](docs/adr/0009-definition-of-completed-order-for-reports.md) |
| RF-09 Audit log | Complete | [Data model](docs/database/er-diagram.md) |

The 21 acceptance criteria of the brief are in the [criteria map](docs/quality/acceptance-criteria-map.md): for each one it says what makes it hold and which test proves it. The tests are 697 for the database (tSQLt), 16 concurrency scenarios with real connections, 26 HTTP flows against SQL Server and more than 550 unit tests.

## 3. Architecture

A modular monolith with vertical slices; inside each module the dependency rule is `presentation → application → domain ← infrastructure` and `dependency-cruiser` checks it in CI.

```mermaid
flowchart LR
  B[Browser<br/>React 18] --> N[nginx<br/>limit_req]
  N --> F[frontend<br/>static files]
  N --> A[backend<br/>Express TS]
  A -->|typed stored procedures| DB[(SQL Server)]
  A --> V[(payment proofs volume)]
  M[db-migrate<br/>V/R/S runner] --> DB
```

**How controllers and routes are organised.** Each module in `backend/src/modules/<module>/` has the same four folders, and a request goes through them in order:

| Layer | Where | What it does |
|---|---|---|
| Routes and controllers | `presentation/*.routes.ts` | Validates the body with zod, applies security, rate limiting and idempotency, calls the port and builds the answer. It has no business logic |
| Application | `application/` | The ports (interfaces) that the presentation layer uses |
| Domain | `domain/` | Pure rules, with no Express and no SQL |
| Infrastructure | `infrastructure/sql-*-repository.ts` | The only place that calls a stored procedure, with typed parameters |

Example, `PUT /api/v1/cart/items/{id}`: `cart.routes.ts` validates the quantity (1 to 99) and takes the user from the token, calls `CartRepository.setItem`, and `sql-cart-repository.ts` runs `SP_Cart_SetItemQuantity`, which is the one that checks the stock. Everything is wired in a single place, `backend/src/composition-root.ts`. The logic that has to be atomic lives in the stored procedures ([ADR-0002](docs/adr/0002-critical-rules-in-stored-procedures-and-checks.md)); the backend orchestrates and never calculates amounts.

The contract is in [docs/api/openapi/openapi.yaml](docs/api/openapi/openapi.yaml) and has **91 operations**:

| Module | Operations | Module | Operations |
|---|---|---|---|
| Authentication | 9 | Orders | 8 |
| Catalogue (public and administration) | 15 | Payments, deposits and refunds | 16 |
| Cart | 6 | Inventory | 3 |
| Addresses | 3 | Coupons | 4 |
| Checkout | 3 | Users | 2 |
| Audit log and system | 4 | Dashboard | 5 |
| Health | 2 | Branches | 5 |
| Payment methods | 4 | | |

More detail in [docs/architecture](docs/architecture/01-system-overview.md) and in the [C4](docs/architecture/c4/context.md) diagrams.

## 4. Technical decisions

Decisions are recorded as ADRs (25 in total). The ones that shape everything:

| Decision | ADR |
|---|---|
| Modular monolith with vertical slices | [0001](docs/adr/0001-modular-monolith-with-vertical-slices.md) |
| Critical rules live in procedures and `CHECK` | [0002](docs/adr/0002-critical-rules-in-stored-procedures-and-checks.md) |
| Own forward-only migration runner | [0003](docs/adr/0003-own-forward-only-migration-runner-in-node.md) |
| Idempotency at two levels | [0004](docs/adr/0004-idempotency-at-two-levels.md) |
| The server never takes cards | [0005](docs/adr/0005-server-never-takes-cards.md) |
| The order is born as `PendingPayment` | [0014](docs/adr/0014-order-created-as-pending-payment.md) |
| Half-even rounding and integer arithmetic | [0019](docs/adr/0019-half-even-rounding-and-integer-arithmetic.md) |
| Amounts as decimal strings in the API | [0020](docs/adr/0020-amounts-as-decimal-strings-in-the-api.md) |
| British English everywhere, comments in Spanish | [0024](docs/adr/0024-language-and-spelling-conventions.md) |

## 5. Open decisions and assumptions

The brief leaves some decisions open on purpose. These are the positions taken; the full record is in [decision-log](docs/progress/decision-log.md) and [open-questions](docs/progress/open-questions.md).

| Topic | What was decided |
|---|---|
| Payment gateway | There is no gateway. The payment is a simulated **bank deposit**: the customer uploads the proof, the staff reviews it and approves it (success) or rejects it with a reason (rejection), and the customer opens another attempt, up to three (retry). The card code is inactive by default |
| Stock and reservation | When the payment starts the units are reserved for 15 minutes. The order is created in a single transaction that takes the reservation; the exit movement of the ledger is written when the payment is approved ([ADR-0007](docs/adr/0007-stock-reservation-as-expiring-counter.md)). An abandoned order leaves no noise in the ledger |
| Returns | Total or partial by line, **several per order**. The operator or the administrator registers them; the customer does not. The brief defines no return window and none was invented |
| Cancellation | While the order has not been dispatched. It releases the reservation or returns the units to the ledger and leaves a pending refund |
| VAT | 12 % included in the price; each order stores the taxable base and the VAT |
| Time zone | Guatemala (UTC-6). The reports group by the payment date in local time |
| Staff accounts | They are not created through the API: they are seeded. Public registration only creates customers, so that a mistake cannot create an administrator |
| Session | 15 minute JWT access token; opaque refresh token with rotation and reuse detection, delivered in an `HttpOnly; SameSite=Strict` cookie (the body repeats it for Postman); progressive account lockout |
| Money | `DECIMAL(18,2)` in tables, `BIGINT` cents in the calculations, half-even rounding applied once and decimal strings in the API |

**Naming standard.** The brief defines the format (`SP_Module_Process`, `VW_`, `FU_`, `ID<Entity>` keys, first letter of each word in capitals) and gives examples in Spanish, such as `SP_Pedidos_CrearPedido`. The format is followed by every object, and the names are in British English by decision of the team ([ADR-0024](docs/adr/0024-language-and-spelling-conventions.md)): `SP_Orders_CreateOrder`, `IDProduct`. The [glossary](docs/glossary.md) gives the equivalent of every term of the brief. <!-- spelling-ignore -->

## 6. Data model and lifecycle

The full diagram and the order of the migrations are in [docs/database/er-diagram.md](docs/database/er-diagram.md). The database has 41 tables, 100 stored procedures, 22 table functions, 6 views and 11 triggers. Summary of the main relationships:

```mermaid
erDiagram
  Users ||--o{ Orders : places
  Orders ||--o{ OrderLines : contains
  Orders ||--o{ Payments : "is paid with"
  Payments ||--o{ PaymentProofs : supports
  Variants ||--o{ OrderLines : "is sold as"
  Variants ||--o{ InventoryMovements : ledger
  Orders ||--o{ FinancialMovements : "money ledger"
```

Order lifecycle (the payment's is in [docs/architecture/04-state-machines.md](docs/architecture/04-state-machines.md)). The allowed transitions are rows of the `OrderStatusTransitions` table: a trigger rejects any other, even if the backend fails. Several partial returns leave the order in `PartiallyReturned`; when nothing is left to return it moves to `Returned`.

```mermaid
stateDiagram-v2
  [*] --> PendingPayment
  PendingPayment --> Paid
  PendingPayment --> Cancelled
  Paid --> InPreparation
  Paid --> Cancelled
  InPreparation --> Dispatched
  InPreparation --> Cancelled
  Dispatched --> Delivered
  Delivered --> PartiallyReturned
  Delivered --> Returned
  PartiallyReturned --> PartiallyReturned
  PartiallyReturned --> Returned
```

## 7. Quick start: from zero to a complete test

Follow the steps in order. The whole route takes about 15 minutes the first time, mostly building the images.

**1. Requirements.** Node.js 26, Git and Docker: Docker Desktop running (Windows with WSL2) or Docker Engine with the compose plugin (Linux). Check them:

```bash
node -v
docker info
```

**2. Download and install.**

```bash
git clone https://github.com/RedeArmy/bakery-shopcart-ecommerce.git
cd bakery-shopcart-ecommerce
npm ci
```

If `npm` does not work in Windows PowerShell (for example, "running scripts is disabled"), use `npm.cmd` and `npx.cmd` instead of `npm` and `npx` in every command of this guide, for example `npm.cmd ci` and `npm.cmd run up`; or use Git Bash, where `npm` works unchanged.

**3. Start the environment.**

```bash
npm run up
```

It creates `.env` with generated local secrets if it does not exist, builds the images, applies the migrations and the seeds (the test accounts included) and waits for the services to be healthy. The services are `db`, `db-migrate`, `backend`, `frontend` and `nginx`.

**4. Check that it is alive.** Open these addresses in the browser:

| Address | Expected answer |
|---|---|
| `http://localhost:8080/health/ready` | 200: the database answers and the schema is up to date |
| `http://localhost:8080/api/v1/categories` | 200: the 6 categories of the demo catalogue |
| `http://localhost:8080/` | The shop, with the demo catalogue |

`/api/v1` alone does not exist and answers 404 `ROUTE_NOT_FOUND`: the API has only concrete routes.

**5. Get the passwords.** Open the `.env` file in the root and copy `SEED_ADMIN_PASSWORD`, `SEED_OPERATOR_PASSWORD` and `SEED_CUSTOMER_PASSWORD`. They are generated at random on each machine and are not in the repository ([credentials](#10-test-credentials)).

**6. Sign in to the application.** Open `http://localhost:8080/` and press **Iniciar sesión** (sign in). Each account sees something different:

| Account | What it sees |
|---|---|
| Not signed in (visitor) | The shop: catalogue, cart and checkout as a guest |
| `customer1@shopcart.test` or `customer2@shopcart.test` | The shop with their orders, their profile and the payment of each order |
| `operator@shopcart.test` | The staff panel at `/admin`: orders, cash collections, deposits and inventory |
| `admin@shopcart.test` | All of the above plus users, catalogues, coupons, refunds, branches, payment methods and the audit log |

**7. Check that the seed left the test data.** `npm run up` loads, through the same procedures the application uses, four accounts, the demo catalogue and the data needed to try the whole flow. Check it with the summary that the `db-migrate` step writes:

```bash
docker compose logs db-migrate --tail 6
```

It must end with these two lines (the numbers are the ones of the delivery):

```text
Demo accounts created: admin@shopcart.test, operator@shopcart.test, customer1@shopcart.test, customer2@shopcart.test.
Demo catalogue created: 6 categories, 60 products, 98 variants (6070 units), 4 coupons, 2 bank accounts, 2 branches.
```

| Data | What there is | What to try |
|---|---|---|
| Users | 1 administrator, 1 operator and 2 customers | Access by role and buying as a customer |
| Categories | Pasteles, Cupcakes, Galletas, Pan dulce, Postres fríos and Temporada | Catalogue filter and category maintenance |
| Products | 60 products with 98 variants (sizes and flavours) and 6,070 units in stock | Search, cart, stock reservation and made-to-order products |
| Coupons | `WELCOME10` (10 %, once per customer), `CAKES25` (Q25), `SOLDOUT` (used up) and `EXPIRED` (expired) | A valid coupon and the used-up and expired messages |
| Branches | Sucursal Centro and Sucursal Zona 10 | Pickup and cash payment |
| Bank accounts | 2 accounts of "Banco de Ejemplo" | Deposit payment with a proof |

You can also see it without opening the browser:

```bash
curl http://localhost:8080/api/v1/categories
curl "http://localhost:8080/api/v1/products?size=5"
curl http://localhost:8080/api/v1/branches
```

**8. Walk through the whole flow.** As a customer: pick a product, add it to the cart, apply `WELCOME10`, pay by deposit and upload the proof. As an operator or administrator: open **Depósitos** (deposits), approve the proof and move the order along (preparation, dispatch, delivery). The administrator can also cancel a paid order and process its refund. The 18 browser journeys that check it run with `npx playwright install chromium` and then `npm run test:e2e`, with `E2E_ADMIN_PASSWORD` equal to `SEED_ADMIN_PASSWORD` in `.env`.

**9. Test with Postman.** The folder [docs/api/postman](docs/api/postman/README.md) has the collection in English, the same one in Spanish and an environment:

1. In Postman, import `ShopCart.postman_collection.json` and `ShopCart.local.postman_environment.json`.
2. Choose the environment **ShopCart · local** and paste the two passwords into the **Current value** column of `adminPassword` and `customerPassword`.
3. Open the collection, press **Run** and keep the folder order. Expected result: 38 requests, 66 assertions, 0 failed.

Each run creates its own data, so it can be repeated; wait one minute between runs because sign-in allows five attempts per minute.

**10. Or from a terminal**, without Postman (about 50 seconds; for the Spanish collection change the file to `ShopCart.postman_collection.es.json`):

```bash
npx newman run docs/api/postman/ShopCart.postman_collection.json -e docs/api/postman/ShopCart.local.postman_environment.json --env-var "adminPassword=<SEED_ADMIN_PASSWORD>" --env-var "customerPassword=<SEED_CUSTOMER_PASSWORD>"
```

**11. Stop.**

```bash
npm run down
```

To start from scratch, database included, use `docker compose down --volumes`, delete `.env` and repeat from step 3. Optional profiles: `quality` (SonarQube) and `observability`. More help in the [runbook](docs/operations/runbook.md) and in [Windows and Linux](docs/operations/environment-windows-linux.md).

| If you see this | What it means and how to fix it |
|---|---|
| `db` stays "unhealthy" and the log says `Login failed for user 'sa'` | A volume from an earlier run keeps another password. Run `docker compose down --volumes` and go back to step 3 |
| `429 Too Many Requests` on sign-in | The five attempts per minute were used. Wait a minute |
| `401` when signing in as administrator | The pasted password is not the one in the current `.env` |
| `503` on `/health/ready` | The migrations have not finished. Check `docker compose logs db-migrate` |
| Port 8080 is taken | Change `EDGE_PORT` in `.env` and `baseUrl` in the Postman environment |
| Collation error or `SERVER_SHUT_DOWN` | Old volume: `docker compose down --volumes` |

## 8. How to verify the delivery

**With the Postman collection.** Its 38 requests are the fewest that prove the delivery, and the first folder that matters is **authentication**: it registers a customer, signs in, reads the profile, rejects a missing token and a wrong password, and checks the rotation of the refresh token. The others go through the catalogue, the cart, the coupons, the checkout with its idempotency, the ownership of data, the order lifecycle and the audit log. The table of what each folder proves is in the [Postman README](docs/api/postman/README.md) and the map of each criterion to its test in the [acceptance criteria map](docs/quality/acceptance-criteria-map.md). To explore the 91 operations, import `docs/api/openapi/openapi.yaml` in Postman: it generates one request per operation.

**With the automated tests.** The database and concurrency tests run against a throwaway SQL Server:

| What is tested | Command |
|---|---|
| Unit tests of the backend, the runner and the scripts | `npm test` |
| 697 database tests (tSQLt) | `npm run sql:test:up` and then `npm run sql:test` |
| 16 concurrency scenarios with real connections | `npm run sql:concurrency` |
| HTTP flows against SQL Server (26) | `npm run test:integration -w backend`, with the test server migrated ([commands](docs/quality/sql-testing-tsqlt.md#concurrency-http-and-performance-suites)) |
| Procedure coverage by tests (100 of 100) | `npm run sql:coverage` |
| Timings of lists and reports with 50,000 orders | `npm run sql:bench` |

## 9. Commands

| Command | What it does |
|---|---|
| `npm run up` / `down` / `logs` | Starts, stops and follows the logs of the environment |
| `npm run lint` | ESLint, Prettier, cspell, British spelling, README synchronisation and SQL file names |
| `npm run typecheck` | Type checking |
| `npm test` | Unit tests of every package |
| `npm run arch:check` | Dependency rules and their self-test |
| `npm run db:migrate` / `db:verify` / `seed` | Migrations, drift verification and demo accounts |
| `npm run sql:lint` / `sql:test` / `sql:coverage` | SQL lint, tSQLt tests and procedure coverage |
| `npm run sql:test:up` / `sql:test:down` | Starts and stops the throwaway SQL Server of the tests |
| `npm run sql:concurrency` / `sql:bench` | Concurrency scenarios and performance benchmark |
| `npm run api:generate` / `api:check` | Generates the TypeScript client of the frontend from OpenAPI and checks that it is not out of date |

## 10. Test credentials

The test accounts are created by the seed step of `db-migrate` when `SEED_DEMO_DATA` is `true`, which is what `npm run up` leaves. The e-mail addresses use the reserved `.test` domain and are not secrets:

| Role | E-mail |
|---|---|
| Administrator | `admin@shopcart.test` |
| Operator | `operator@shopcart.test` |
| Customer | `customer1@shopcart.test` and `customer2@shopcart.test` |

The passwords are **not in the repository**: `npm run up` generates them at random in your local `.env` file, in the variables `SEED_ADMIN_PASSWORD`, `SEED_OPERATOR_PASSWORD` and `SEED_CUSTOMER_PASSWORD` (both customers share the last one), and the database only keeps their argon2id hash. To get new passwords, stop the environment with `docker compose down --volumes`, delete `.env` and run `npm run up` again. More detail in [docs/operations/test-accounts.md](docs/operations/test-accounts.md).

## 11. Payments

The payment is a **bank deposit** simulated end to end, with no gateway. The customer confirms the order and chooses a bank account; there is a window to pay and the customer uploads the proof (JPEG, PNG or PDF up to 5 MB, validated by its first bytes). The payment goes through these states:

| Payment state | What it means |
|---|---|
| `Pending` | Waiting for the proof |
| `UnderReview` | Proof received; the staff reviews it |
| `Approved` | **Success:** the order moves to `Paid` and the stock leaves the ledger |
| `Rejected` | **Rejection:** with a reason; the customer can open another attempt, up to three |
| `Expired` | The window ended without payment: the order is cancelled and the reservation is released by itself |

The rule for when the deposit is offered according to the delivery date is in [payments/availability-rule](docs/payments/availability-rule.md) and the full flow in [payments/bank-deposit](docs/payments/bank-deposit.md). Card payment (Recurrente) is not required for this delivery: simulating the payment is enough. Its code exists but stays inactive while there are no credentials, and without them only the deposit is offered, both in the interface and in the backend (`422 PAYMENT_METHOD_UNAVAILABLE`).

## 12. Repository map

| Path | Content |
|---|---|
| `backend/` | Express + TypeScript API organised by modules |
| `frontend/` | React 18 + Vite + Tailwind |
| `db/` | `V` migrations, `R` objects, `S` seeds, tSQLt tests, performance benchmark, lint and runner |
| `docker/`, `docker-compose.yml` | nginx, SQL Server initialisation and profiles |
| `docs/` | ADRs, architecture, database, API (with the Postman collection), payments, quality, operations and progress |
| `tools/` | Verification scripts and the Recurrente simulator |

## 13. Documentation

Full index in [docs/README.md](docs/README.md). API contract in [docs/api/openapi/openapi.yaml](docs/api/openapi/openapi.yaml). Acceptance criteria map in [docs/quality/acceptance-criteria-map.md](docs/quality/acceptance-criteria-map.md). Database performance in [docs/operations/performance.md](docs/operations/performance.md). Contribution guide in [CONTRIBUTING.md](CONTRIBUTING.md) and security policy in [SECURITY.md](SECURITY.md).

## 14. Delivery status

**Phase 1, database and backend: complete.** 19 migrations, 100 procedures, the 91-operation API, authentication with token rotation, the simulated payment, the background jobs (expiry of reservations and payments, data purge, reconciliation of amounts and stock) and the tests described in section 8. The history of changes and the decisions are in [STATUS](docs/progress/STATUS.md) and [ROADMAP](docs/progress/ROADMAP.md).

**Demo data.** When the environment starts there are the four test accounts and a small shop: 60 products in 6 categories (98 variants and 6,070 units, three out of stock on purpose; the bags of 6 and the dozens of the sweet bread share one stock in units), the coupons `WELCOME10`, `CAKES25`, `SOLDOUT` and `EXPIRED`, two fictitious bank accounts and two branches for picking orders up. They are created through the real procedures and running the step again duplicates nothing ([details and how to see each coupon message](docs/operations/demo-data.md)). The Postman collection still creates its own data.

**Phase 2, frontend: complete.** The shop: catalogue with server-side search and filters, product with its variants and packagings, cart with coupon, checkout with stock reservation, deposit payment with proof and my orders. The administration, by role: the **operator** reviews deposits and cash payments, handles orders and returns and moves the inventory by category; the **administrator** also sees the dashboard with its charts, maintains the catalogue, the coupons, the branches, the payment methods and the users, marks the refunds and reads the audit log. Protected routes and menus by role, forms with validation in Spanish, tables with server-side paging and filters (kept in the address), loading, empty and error states in every view, transparent token renewal and a responsive interface. The tests are unit tests (Vitest) and end-to-end tests (Playwright, `npm run test:e2e` with `E2E_ADMIN_PASSWORD`). The design is in [the frontend design](docs/architecture/06-frontend-lld.md).

**Known improvements.** What was not done or was done halfway: editing a product does not send the row version because the API does not expose it yet (two administrators editing the same product at the same time would overwrite each other); a deactivated product has no operation to reactivate it; the list of refunds comes whole (up to 100) and is not paged; the units per pack of a packaging cannot be edited once created (a different size is a new packaging); guests accumulate without a retention rule; and the optional extras of the brief (cache, export and real time) are not done.
