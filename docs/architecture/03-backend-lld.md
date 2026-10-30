# 03 · Backend low-level design

## Vertical slices, hexagonal inside each slice

The dependency rule is `presentation → application → domain ← infrastructure`. `dependency-cruiser` verifies it in CI, including a self-test that proves a deliberate violation is detected (`npm run arch:check`).

| Treatment | Modules |
|---|---|
| Full (domain, use cases, ports, adapters) | checkout, inventory, coupons, orders, payments |
| Light (controller → service → repository) | auth, catalogue, cart, dashboard, audit, users |

## Repository structure

```
backend/src/
├─ main.ts                    # process entry point only
├─ composition-root.ts        # the only place where concrete classes are wired
├─ shared-kernel/             # Money, rounding, Result<T,E>, AppError, Clock (port), ids
├─ platform/
│  ├─ config/                 # env.ts (zod), payments.ts
│  ├─ db/                     # pool.ts, execute-procedure.ts, map-sql-error.ts
│  ├─ http/                   # app.ts, request-id, error-handler, health routes, security
│  ├─ idempotency/            # middleware + IdempotencyStore port
│  ├─ rate-limit/             # policies + RateLimitStore port
│  ├─ logging/  telemetry/  jobs/  storage/
└─ modules/
   └─ <module>/
      ├─ domain/              # entities, value objects, domain services, domain errors
      ├─ application/         # use-cases/<use-case>/, ports/ (in and out), dto/
      ├─ infrastructure/      # stored-procedure repositories, gateways, adapters
      ├─ presentation/        # routes, controllers, zod schemas, mappers
      └─ index.ts             # the module public surface
```

Rules enforced by `dependency-cruiser`:

- A module imports another module only through its `index.ts`.
- `domain/` imports nothing from `application/`, `infrastructure/` or `presentation/`, and nothing from Express, `mssql` or zod.
- `application/` never imports `infrastructure/` or `presentation/`; `presentation/` never imports `infrastructure/`.
- Only `infrastructure/` (and `platform/db`) imports `execute-procedure.ts`.
- `shared-kernel/` has no I/O, no external packages and no dependency on `platform` or `modules`.
- No circular dependencies.

## Responsibilities by layer

| Layer | Responsibility |
|---|---|
| TypeScript domain | Value objects (`Money`, `Quantity`, `Sku`), pre-validation, use-case orchestration, error mapping, gateway and storage integration |
| SQL procedures and `CHECK`s | Invariants that need atomicity: stock, coupon, order creation, payment approval, state transitions, return limit |
| Ports | `InventoryRepositoryPort`, `OrderRepositoryPort`, `PaymentRepositoryPort`, `CouponRepositoryPort`, `PaymentGatewayPort`, `FileStoragePort`, `Clock`, `IdempotencyStorePort`, `RateLimitStorePort` |

The domain does not know SQL Server exists. The reason some rules live in the database is recorded in [ADR-0002](../adr/0002-critical-rules-in-stored-procedures-and-checks.md).

## The single data access point

```ts
// platform/db/execute-procedure.ts — único módulo que habla con la base de datos; siempre parámetros tipados
export function createProcedureExecutor(database: Database) {
  return async function executeProcedure<T>(procedureName: string, params: ProcedureParam[] = [], outputs = []) {
    const request = (await database.getPool()).request();
    for (const param of params) request.input(param.name, param.type, param.value);
    try {
      // Reintenta únicamente ante deadlock (1205): el procedimiento es atómico, repetirlo es seguro
      return await withDeadlockRetry(() => request.execute<T>(procedureName));
    } catch (error) {
      throw mapSqlError(error);
    }
  };
}
```

## Error mapping

Business errors raised with `THROW` carry codes at or above 50000.

| SQL code | HTTP | Meaning |
|---|---|---|
| 50400 | 400 | Invalid parameter |
| 50404 | 404 | Does not exist, or does not belong to the user (existence is not leaked) |
| 50409 | 409 | Conflict: out of stock, exhausted coupon, expired reservation, reference already used |
| 50422 | 422 | Business rule: invalid transition, expired coupon, below minimum, return exceeded, amount mismatch, reused proof |
| 1205 | retry | Deadlock |

The HTTP error body is always `{ "error": { "code", "message", "details", "requestId" } }`. Unknown database errors become a generic 500 without leaking the message.

## Composition root

```ts
// composition-root.ts
export function buildContainer(env: Env) {
  const clock = new SystemClock();
  const storage = new LocalDiskStorage(env.PAYMENT_PROOFS_DIR);
  const gateway = hasRecurrenteKeys(env) ? new RecurrenteGateway(recurrenteConfig(env)) : null; // Fase 2
  const methods = new PaymentMethodsRegistry(env, gateway, logger);
  const paymentRepository = new SqlPaymentRepository(executeProcedure);
  const confirmCheckout = new ConfirmCheckout(new SqlCheckoutRepository(executeProcedure), paymentRepository, methods, gateway, clock);
  const uploadPaymentProof = new UploadPaymentProof(paymentRepository, storage);
  return { confirmCheckout, uploadPaymentProof, methods };
}
```

## Use cases return `Result`

```ts
// modules/payments/application/use-cases/confirm-checkout/confirm-checkout.ts
export class ConfirmCheckout {
  /** Crea el pedido PendingPayment y su pago. La idempotencia ya fue resuelta por el middleware. */
  async execute(command: ConfirmCheckoutCommand): Promise<Result<CheckoutConfirmed, DomainError>> {
    // Doble validación: la interfaz oculta métodos no disponibles, pero el backend también decide
    if (!this.methods.isAvailable(command.method)) return err(new PaymentMethodUnavailable(command.method));

    // El monto lo calcula la base de datos: el cliente nunca envía importes
    const order = await this.checkoutRepository.createOrder(command);

    if (command.method === 'CARD') {
      try {
        const checkout = await this.gateway!.createCheckout({ /* total, metadata, urls */ });
        await this.paymentRepository.registerExternalCheckout(order.idPayment, checkout.id, checkout.checkoutUrl);
        return ok({ ...order, checkoutUrl: checkout.checkoutUrl });
      } catch {
        await this.paymentRepository.registerCreationFailure(order.idPayment); // el pedido sigue PendingPayment
        return err(new GatewayUnavailable());
      }
    }
    return ok(order); // depósito: datos bancarios y fecha límite
  }
}
```

## Ports for payments

```ts
// domain/ports.ts
export interface PaymentGatewayPort {
  createCheckout(input: {
    amount: Money; description: string; metadata: Record<string, string>;
    successUrl: string; cancelUrl: string; expiresAt: Date;
  }): Promise<{ id: string; checkoutUrl: string }>;
  getCheckout(id: string): Promise<{ id: string; status: 'paid' | 'pending' | 'expired' | 'unknown'; amount: Money | null }>;
  probe(): Promise<boolean>; // GET /api/test
}
export interface FileStoragePort {
  save(key: string, data: Buffer): Promise<void>;
  open(key: string): Promise<NodeJS.ReadableStream>;
  remove(key: string): Promise<void>;
}
```

## Jobs

The runner (`platform/jobs`) lives in the API process. Each job is a stored procedure (`SP_Jobs_*`) that takes its own lock and does the work, so the TypeScript side only decides **when** to call it.

| Job | Frequency | Phase | What it does |
|---|---|---|---|
| `expirePayments` | 60 s | 1 | `SP_Jobs_ExpirePayments`: `SP_Payments_ExpirePending`, then `SP_Inventory_ReleaseExpiredReservations` for the carts that reserved and never confirmed |
| `purgeExpired` | daily | 1 | `SP_Jobs_PurgeExpired`: `SP_Idempotency_PurgeExpired`. The purges of `DdlHistory` and `ReceivedWebhooks` (D-08) join it when they have a procedure |
| `reconcileAmounts` | daily | 1 | `SP_Jobs_ReconcileAmounts`: counts the rows of `VW_Reconciliation_Amounts` and `VW_Inventory_Reconciliation`; any row writes an audit entry and the job logs an error |
| `reconcileCards` | 2 min | 2 | For pending card payments, `GET /api/checkouts/:id`; confirms when `paid` |
| `probeGateway` | 5 min | 2 | `registry.refresh()` |

**Single execution across replicas.** Every `SP_Jobs_*` procedure starts with `sp_getapplock` (`Exclusive`, owner `Session`, timeout 0) on `Job:<Name>`. A second instance does not wait: it answers `Skipped` and tries again at its next turn. The lock is a *session* lock and not a transaction lock on purpose: `SP_Payments_ExpirePending` cancels each order in its own transaction, so that one failure does not undo the rest, and a transaction lock would force one transaction around everything. A procedure call holds a single connection from start to finish, so a session lock is safe with a pooled client, it is released in a `CATCH` when the job fails and, if the process dies, the connection closes and SQL Server releases it by itself.

**Runner behaviour.** A job is scheduled again when the previous run **finishes** (fixed delay), so inside one process it never overlaps itself. A failure is logged and the job stays scheduled: a database that was down for a minute must not stop reservations from expiring for good. A job that finds work logs it at `info`; one with nothing to do logs at `debug`. The runner stops with the process (`SIGTERM` waits for the run in progress). `GET /admin/system/jobs` shows the state of each job **in the instance that answers**; `GET /admin/system/reconciliation` lists the current discrepancies.

Settings: `JOBS_ENABLED`, `JOB_EXPIRE_SECONDS`, `JOB_PURGE_HOURS` and `JOB_RECONCILE_HOURS` ([configuration reference](../operations/configuration-reference.md)).

## Idempotency middleware

See [API conventions](../api/conventions.md#idempotency) for the contract and [ADR-0004](../adr/0004-idempotency-at-two-levels.md) for the decision.

## Dependency injection and testing

Use cases receive ports through their constructors; tests pass fakes and a fixed `Clock`. There is no container framework: `composition-root.ts` is the only place with `new` for concrete adapters.
