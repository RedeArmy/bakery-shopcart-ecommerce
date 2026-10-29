# Payments overview

ShopCart offers two payment methods. Neither requires the server to touch card data ([ADR-0005](../adr/0005-server-never-takes-cards.md)).

| Method | Code | Phase | Confirmation |
|---|---|---|---|
| Bank deposit | `BANK_DEPOSIT` | 1 (complete) | A person reviews a proof of payment |
| Card through Recurrente | `CARD` | 2 | Signed webhook, return verification, reconciliation job |

Without valid Recurrente credentials **only bank deposit is offered**, in the UI and enforced by the backend ([availability rule](availability-rule.md)).

## Key decisions

| Decision | Summary |
|---|---|
| The order is created as `PendingPayment` | It exists before it is paid, like WooCommerce, Shopify and Odoo do for offline payments ([ADR-0014](../adr/0014-order-created-as-pending-payment.md)) |
| Separate payment state | Its own machine and trigger ([ADR-0015](../adr/0015-payment-state-separated-from-order-state.md)) |
| Windows | Reservation 15 min; card 15 min from confirmation; deposit `MIN(24 h, delivery − lead time days)`, not offered below 2 h; a deposit under review does not expire ([ADR-0016](../adr/0016-deposit-window-capped-by-delivery-date.md)) |
| One line to the gateway | The whole order total in integer cents, GTQ, so descriptions do not need reconciling against discounts, shipping or VAT |
| Stock | Reserved at checkout; physically decremented only when the payment is approved |
| Ledger | Every charge, refund and fee is an append-only financial movement ([ADR-0021](../adr/0021-financial-movements-ledger.md)) |
| Method switching | Not in Phase 1: the customer cancels and buys again. Endpoints arrive in Phase 2 |

## Industry validation

The question reviewed was whether an order should exist before a deposit is confirmed.

| Platform | Handling of a transfer or deposit |
|---|---|
| WooCommerce (BACS) | Order "On hold"; stock is decremented at creation and the merchant verifies the payment manually. Its hold timer does not apply to on-hold orders, so plugins cancel after a period |
| Shopify (manual payment) | Order stays Pending until marked as paid; third-party apps add proof upload, a reconciliation panel and confirm or reject, which is the pattern used here |
| Odoo | The order remains a sent quotation until confirmed manually |
| Home Depot Mexico | Six hours to pay by transfer |
| Navigo (Île-de-France Mobilités) | Ten calendar days, then cancelled |
| Amazon | Pending until the payment is verified, with automatic cancellation; third-party sources quote days up to 21 days (low confidence) |
| Kemik | No public documentation was found; nothing is claimed |

Conclusions: the order exists before payment wherever offline payments are accepted; automatic expiry is mandatory (the `expirePayments` job does it); typical windows range from six hours to ten days, and a bakery uses a short window capped by the delivery date; the proof upload and review queue fill the gap that third-party apps cover elsewhere.

**Question for the evaluator** (answers are shared with all participants). **The evaluator answered affirmatively, so the model stands (recorded on 2026-10-29).** The question that was asked: *In checkout, is it valid to model a `PendingPayment` state before `Paid` to support asynchronous payment methods (for example a bank deposit with a proof), so order creation stays atomic and stock stays reserved until payment is confirmed? Or must the order be created only when payment is already confirmed?* Had the answer been "only on payment", the fallback would have been a separate "deposit request" entity; it is not needed.

See [bank deposit](bank-deposit.md) and [Recurrente](recurrente.md).
