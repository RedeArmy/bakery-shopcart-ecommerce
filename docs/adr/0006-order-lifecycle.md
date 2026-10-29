# ADR-0006: Order lifecycle

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The brief asks the participant to define states and allowed transitions, enforce them in the backend and in the database, and document them with a state diagram. Cancellation is allowed until dispatch; returns happen after delivery.

## Decision

Eight states: `PendingPayment`, `Paid`, `InPreparation`, `Dispatched`, `Delivered`, `Cancelled`, `PartiallyReturned`, `Returned`. Allowed transitions live in the table `OrderStatusTransitions` and are enforced by the trigger `TR_Orders_ValidateTransition` as a second line of defence after the procedure. Every change writes `OrderStatusHistory` and the audit log. A dispatched order can no longer be cancelled.

## Consequences

- An invalid transition is rejected twice: by the procedure and by the trigger.
- The diagram and the table are documented in `docs/architecture/04-state-machines.md`.

## Alternatives considered

- Transitions only in code: bypassable by a faulty procedure or a manual update.

## Links

- [Design v3 §5.5](../design/source/DISENO_SHOPCART_v3.md)
- [ADR-0015](0015-payment-state-separated-from-order-state.md)
