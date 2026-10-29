# ADR-0007: Stock reservation as an expiring counter

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Several customers may buy the last unit at the same time; the brief requires zero overselling and a 15-minute reservation that is released without manual intervention.

## Decision

Each variant keeps `OnHandStock` and `ReservedStock` with `CHECK (ReservedStock <= OnHandStock)`. `SP_Inventory_ReserveStock` runs one set-based conditional `UPDATE ... WITH (UPDLOCK, ROWLOCK)` for the whole cart and fails with 409 if any row is not updated, which rolls everything back. Reservations expire and a job releases those without an order every 60 seconds under `sp_getapplock`. Physical stock only decreases when a payment is approved. A deposit under review does not expire.

## Consequences

- The second buyer re-evaluates against the updated value and receives 409.
- Deadlocks between multi-item carts are mitigated by the set-based update and a retry on error 1205.
- The inventory ledger contains only physical movements; abandoned orders leave no noise.

## Alternatives considered

- `SERIALIZABLE` with a cursor: more contention and deadlock risk.
- Redis for reservations: breaks atomicity with the order.
- Decrementing stock at order creation (WooCommerce style): abandoned orders would need compensating ledger movements.

## Links

- [Design v3 §7.6 and D4](../design/source/DISENO_SHOPCART_v3.md)
