# ADR-0014: Order created as PendingPayment

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

A bank deposit takes hours and needs a reference number and a review queue, so the order must exist before it is paid. The brief calls an order a "confirmed purchase", which this model reinterprets. WooCommerce, Shopify and Odoo all create the order before an offline payment is confirmed.

## Decision

At checkout confirmation, `SP_Orders_CreateOrder` atomically creates the order in `PendingPayment`, its lines (with price snapshots), the coupon usage, the payment in `Pending`, and links the reservation to the order. The order becomes `Paid` when a payment is approved. The order number is the deposit reference. Expired or abandoned orders are cancelled by a job.

## Consequences

- Reports must exclude `PendingPayment` (ADR-0009).
- The evaluator confirmed in writing that modelling a `PendingPayment` state before `Paid` is valid (recorded on 2026-10-29). The fallback of a separate "deposit request" entity is therefore not needed and `SP_Orders_CreateOrder` is written as designed.

## Alternatives considered

- Create the order only when paid: requires a parallel pre-order entity and loses the reference number at checkout.

## Links

- [Design v3 §12.9](../design/source/DISENO_SHOPCART_v3.md)
- [ADR-0006](0006-order-lifecycle.md)
