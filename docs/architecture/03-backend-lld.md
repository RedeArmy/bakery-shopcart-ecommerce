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

| Job | Frequency | Phase | What it does |
|---|---|---|---|
| `expirePayments` | 60 s | 1 | `SP_Payments_ExpirePending`, then release reservations without an order |
| `purges` | daily | 1 | Orphan files, `SP_Idempotency_PurgeExpired`, `SP_Webhooks_Purge` (30 days) |
| `reconcileCards` | 2 min | 2 | For pending card payments, `GET /api/checkouts/:id`; confirms when `paid` |
| `probeGateway` | 5 min | 2 | `registry.refresh()` |
| `reconcileAmounts` | daily | 1 | Checks `VW_Reconciliation_Amounts`; alerts and audits when rows appear |

All jobs take `sp_getapplock` so only one instance runs.

## Idempotency middleware

See [API conventions](../api/conventions.md#idempotency) for the contract and [ADR-0004](../adr/0004-idempotency-at-two-levels.md) for the decision.

## Dependency injection and testing

Use cases receive ports through their constructors; tests pass fakes and a fixed `Clock`. There is no container framework: `composition-root.ts` is the only place with `new` for concrete adapters.
