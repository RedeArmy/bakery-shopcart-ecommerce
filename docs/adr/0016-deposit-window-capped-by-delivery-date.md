# ADR-0016: Deposit window capped by the delivery date

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

A card payment fits a 15-minute window; a deposit does not. Holding stock for 24 hours for a cake that is needed tomorrow is wasteful, and a deposit offered too late is useless.

## Decision

The deposit deadline is `MIN(24 h, requested delivery date − lead time days)`, computed by `FU_Payments_DepositWindow` with the delivery interpreted at 00:00 Guatemala time (`Central America Standard Time`). If fewer than `MinDepositHours` (2) remain, the method is not offered and the procedure answers `422 DEPOSIT_UNAVAILABLE_FOR_DATE`. After a rejection the window resumes with `MAX(current, now + RejectionGraceHours)`.

## Consequences

- Urgent cakes do not hold stock for a day.
- Configuration keys (`DepositReservationHours`, `MinDepositHours`, `RejectionGraceHours`, `MaxDepositAttempts`) are tunable without code changes.

## Alternatives considered

- A fixed 24-hour window: ignores delivery dates.

## Links

- [Design v3 §7.4 and D20](../design/source/DISENO_SHOPCART_v3.md)
