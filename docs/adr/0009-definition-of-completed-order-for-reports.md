# ADR-0009: Definition of "completed order" for reports

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The brief says reports only consider completed orders, excluding cancelled ones and discounting returns. With orders now created as `PendingPayment`, "completed" needs a precise meaning.

## Decision

A completed order has `PaidAt IS NOT NULL` and is not `Cancelled`; reports group by `PaidAt` and subtract returns. `PendingPayment` orders never count as sales. The average ticket is total sold divided by paid orders, using half-even division.

## Consequences

- Dashboards reflect money actually received.
- Reports aggregate in SQL and use the index `IX_Orders_PaidAt`.

## Alternatives considered

- Counting orders at creation: would inflate sales with unpaid and expired orders.

## Links

- [Design v3 §1.4 D5](../design/source/DISENO_SHOPCART_v3.md)
