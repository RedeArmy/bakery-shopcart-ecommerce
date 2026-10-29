# Architecture decision records

One decision per file, written from [the template](0000-template.md). New decisions get the next free number and a line in [the decision log](../progress/decision-log.md).

| ADR | Title | Status |
|---|---|---|
| [0001](0001-modular-monolith-with-vertical-slices.md) | Modular monolith with vertical slices | Accepted |
| [0002](0002-critical-rules-in-stored-procedures-and-checks.md) | Critical rules in stored procedures and CHECK constraints | Accepted |
| [0003](0003-own-forward-only-migration-runner-in-node.md) | Own forward-only migration runner in Node | Accepted |
| [0004](0004-idempotency-at-two-levels.md) | Idempotency at two levels | Accepted |
| [0005](0005-server-never-takes-cards.md) | The server never takes cards: own deposit flow and hosted card checkout | Accepted |
| [0006](0006-order-lifecycle.md) | Order lifecycle | Accepted |
| [0007](0007-stock-reservation-as-expiring-counter.md) | Stock reservation as an expiring counter | Accepted |
| [0008](0008-vat-included-and-how-it-is-calculated.md) | VAT included and how it is calculated | Accepted |
| [0009](0009-definition-of-completed-order-for-reports.md) | Definition of "completed order" for reports | Accepted |
| [0010](0010-layered-rate-limiting.md) | Layered rate limiting | Accepted |
| [0011](0011-contract-first-openapi.md) | Contract-first OpenAPI | Accepted |
| [0012](0012-versioning-of-sql-objects-and-expand-contract.md) | Versioning of SQL objects and expand/contract | Accepted |
| [0013](0013-cart-with-absolute-quantities.md) | Cart with absolute quantities | Accepted |
| [0014](0014-order-created-as-pending-payment.md) | Order created as PendingPayment | Accepted (pending confirmation from the evaluator) |
| [0015](0015-payment-state-separated-from-order-state.md) | Payment state separated from order state | Accepted |
| [0016](0016-deposit-window-capped-by-delivery-date.md) | Deposit window capped by the delivery date | Accepted |
| [0017](0017-own-recurrente-adapter.md) | Own Recurrente adapter | Accepted |
| [0018](0018-storage-of-payment-proofs.md) | Storage of payment proofs | Accepted |
| [0019](0019-half-even-rounding-and-integer-arithmetic.md) | Half-even rounding and integer arithmetic | Accepted |
| [0020](0020-amounts-as-decimal-strings-in-the-api.md) | Amounts as decimal strings in the API | Accepted |
| [0021](0021-financial-movements-ledger.md) | Financial movements ledger | Accepted |
| [0022](0022-windows-linux-environment-and-npm-run.md) | Windows/Linux environment and npm run | Accepted |
| [0023](0023-sql-tests-with-tsqlt-in-ci-only.md) | SQL tests with tSQLt in CI only | Accepted |
| [0024](0024-language-and-spelling-conventions.md) | Language and spelling conventions | Accepted |
