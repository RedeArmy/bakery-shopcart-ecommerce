# ADR-0015: Payment state separated from order state

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

"Under review" for a bank deposit would pollute the order lifecycle, and one order can have several payment attempts (a rejected proof followed by a new one).

## Decision

Payments have their own state machine: `Pending`, `UnderReview`, `Approved`, `Rejected`, `Failed`, `Expired`, `Refunded`, `Cancelled`, with allowed transitions in `PaymentStatusTransitions` enforced by `TR_Payments_ValidateTransition`. Only one open attempt (`Pending` or `UnderReview`) and one `Approved` payment may exist per order, enforced by filtered unique indexes. A payment under review never expires by time.

## Consequences

- The order stays `PendingPayment` while the payment moves through review and rejection.
- History tables record who or what caused each payment transition (customer, operator, webhook, reconciliation, job).

## Alternatives considered

- Payment status as an order status: mixes concerns and complicates retries.

## Links

- [Design v3 §5.6 and D19](../design/source/DISENO_SHOPCART_v3.md)
