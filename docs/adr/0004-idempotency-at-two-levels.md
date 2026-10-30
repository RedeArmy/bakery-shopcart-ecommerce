# ADR-0004: Idempotency at two levels

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

A double click or a network retry must never create two orders or two charges. Some operations (cart updates, payment verification) are naturally idempotent; others (checkout confirmation, approving a deposit) are not.

## Decision

Defence in depth. Level one is a generic middleware: mutating `POST` and `PATCH` endpoints require an `Idempotency-Key`; `SP_Idempotency_Begin` inserts atomically against a unique key `(scope, method, route, key)`; a completed request replays the stored response with `Idempotent-Replayed: true`, an in-flight one answers 409 with `Retry-After`, and the same key with a different body answers 422. 5xx responses are not stored. Level two is the database: `UQ_Payments_IdempotencyKey`, `UX_Payments_OneOpenAttempt`, `UX_Payments_OneApproved`, `UX_Payments_ExternalReference`, `UX_PaymentDeposits_Reference`, `UQ_CouponUsages_Order`, `UX_FinancialMovements_OneChargePerPayment` and `UX_InventoryMovements_OneExitPerOrder` prevent duplicates even if the middleware fails.

## Consequences

- Responses to retries are identical, including the same bank details or checkout URL.
- Keys expire after 24 hours and a daily job purges them; in-progress requests older than 60 seconds can be taken over.
- Multipart uploads hash the text fields plus the file SHA-256, not the raw body.

## Alternatives considered

- Middleware only: a bug would allow duplicates.
- Database constraints only: correct but the client would see an error instead of the original response.

## Links

- [Design v3 §9](../design/source/DISENO_SHOPCART_v3.md)
