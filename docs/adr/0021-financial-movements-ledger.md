# ADR-0021: Financial movements ledger

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Inventory has a ledger; money needs the same traceability so that every charge, refund and fee can be reconciled and nothing is silently edited.

## Decision

`FinancialMovements` is an append-only table of signed amounts (`Charge +`, `Refund −`, `Fee −`). Triggers and `DENY` block `UPDATE` and `DELETE`; corrections are compensating movements. A unique index allows one charge per payment. `VW_Reconciliation_Amounts` checks subtotals, discounts, totals against payments, the ledger against payments and refunds, returns, fees, inventory and coupon usage, and must return zero rows. A daily job records any difference in the audit log and alerts the administrator.

## Consequences

- The net per order is the sum of its movements.
- Order, line and payment amounts are immutable by trigger.

## Alternatives considered

- Deriving money from order and payment tables only: cannot detect silent edits or missing refunds.

## Links

- [Design v3 §13.7](../design/source/DISENO_SHOPCART_v3.md)
