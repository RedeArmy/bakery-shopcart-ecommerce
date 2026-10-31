# 02 · High-level design

## Components

```mermaid
flowchart LR
  subgraph Client
    B[Browser<br/>React 18 + TS]
  end
  subgraph Docker Compose
    N[nginx<br/>static files, /api proxy, limit_req]
    A[API Express TS]
    J[Jobs: payment and reservation expiry,<br/>reconciliation, purges]
    DB[(SQL Server 2019+)]
    V[(Private volume<br/>payment proofs)]
    M[db-migrate<br/>runner V/R/S]
  end
  B -->|HTTPS| N
  N --> A
  A -->|mssql + typed procedures| DB
  A --> V
  J -->|maintenance procedures| DB
  M -->|migrates, applies objects, seeds| DB
```

There is no payment gateway: only bank deposit is offered. Jobs run inside the API process; `sp_getapplock` makes them single-instance when several replicas run.

## Checkout: confirmation and method choice

```mermaid
sequenceDiagram
  autonumber
  participant U as Customer
  participant API as API
  participant DB as SQL Server
  U->>API: GET /checkout/payment-methods?deliveryDate=
  API-->>U: [BANK_DEPOSIT if the window allows]
  U->>API: POST /checkout/start (15-minute reservation)
  U->>API: POST /checkout/confirm {idReservation, idAddress, deliveryDate, method, idBankAccount} + Idempotency-Key
  API->>API: is the method available? (otherwise 422)
  API->>DB: SP_Orders_CreateOrder
  Note over DB: Atomic transaction: Order (PendingPayment) + lines + coupon<br/>+ Payment (Pending) + reservation linked to the order + audit
  DB-->>API: IDOrder, IDPayment, deadline
  API-->>U: 201 + bank details, reference = OrderNumber, deadline
```

## Bank deposit (Delivery Phase 1)

```mermaid
sequenceDiagram
  autonumber
  participant U as Customer
  participant API as API
  participant FS as Private storage
  participant DB as SQL Server
  participant O as Operator
  U->>U: deposits into the account and notes the bank reference
  U->>API: POST /orders/:id/payment/proofs (multipart) + Idempotency-Key
  API->>API: validates size, real type (magic bytes), SHA-256
  API->>FS: saves under a uuid key
  API->>DB: SP_Payments_RegisterProof
  Note over DB: validates owner, status Pending, unused reference and hash<br/>Payment becomes UnderReview and the reservation stops expiring
  O->>API: GET /admin/payments/deposits?status=UnderReview
  O->>API: GET proof (authenticated stream)
  alt approves
    O->>API: POST /admin/payments/:id/approve
    API->>DB: SP_Payments_ApproveDeposit (calls SP_Payments_ConfirmPayment)
  else rejects
    O->>API: POST /admin/payments/:id/reject {reason}
    API->>DB: SP_Payments_RejectDeposit (Payment Rejected, order stays PendingPayment)
    Note over U: the customer sees the reason and, within the window and up to MaxDepositAttempts,<br/>opens another attempt (POST /orders/:id/payment/attempts) and uploads another proof
  end
```

## Card with Recurrente (not part of this delivery)

A design kept for reference: the evaluator confirmed on 27 October that no payment gateway is required, so none of this is built.

```mermaid
sequenceDiagram
  autonumber
  participant U as Customer
  participant R as Recurrente
  participant API as API
  participant DB as SQL Server
  U->>R: redirected to checkout_url, pays by card
  R->>API: POST /webhooks/recurrente (payment_intent.succeeded, Svix-signed)
  API->>API: verifies signature and age (5 minutes)
  API->>DB: SP_Payments_RegisterWebhookEvent (UNIQUE svix-id)
  alt message already processed
    API-->>R: 200 (no effect)
  else new message
    API->>DB: SP_Payments_ConfirmPayment (validates amount, currency, reference)
    Note over DB: Payment Approved, Order Paid, inventory Exit,<br/>reservation Consumed, audit
    API-->>R: 200
  end
  R-->>U: redirects to success_url
  U->>API: POST /orders/:id/payment/verify (if the webhook has not arrived)
  API->>R: GET /api/checkouts/:id (status)
  API->>DB: SP_Payments_ConfirmPayment (idempotent)
```

## Architecture decisions behind the design

1. The database is the authority for critical rules; the backend validates first for good messages (ADR-0002).
2. A reservation is an expiring counter; the conditional `UPDATE` is the cheapest way to avoid overselling (ADR-0007).
3. Idempotency in two levels (ADR-0004).
4. Order snapshots protected by immutability triggers (SKU, name, attributes, price, discount, VAT).
5. The audit entry is written by the procedure inside the same transaction.
6. The API is stateless; the only stateful pieces are the jobs, protected by `sp_getapplock`.
7. Access by procedures is enforced by the engine: `EXECUTE` is granted and direct table access is denied.
8. Versioning is verifiable: every migration and object has a version, a checksum and a record (ADR-0012).
9. The server never charges a card (ADR-0005).
10. Money is calculated in integers inside the database; the frontend and backend do not calculate amounts (ADR-0019).

## Alternatives rejected

| Alternative | Reason |
|---|---|
| Reservation with `SERIALIZABLE` and a cursor | More contention and deadlock risk |
| Queue (Redis/RabbitMQ) in checkout | Infrastructure with no need at this volume |
| Event sourcing for inventory | The ledger already is a log of movements |
| Redis for reservations | Breaks atomicity with the order |
| GraphQL | REST with OpenAPI is what the brief asks |
| Flyway | Adds Java and another image; the own runner is simpler to defend |
| Unofficial Recurrente SDK | Less control; the own adapter is a few lines |
| Decrement stock at order creation (WooCommerce style) | An abandoned order would create an exit and a compensating entry in the ledger |
| `MONEY` / `FLOAT` | Lose precision; see [money handling](../database/money-handling.md) |
