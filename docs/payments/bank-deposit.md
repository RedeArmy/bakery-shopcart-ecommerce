# Bank deposit (Delivery Phase 1)

## Flow

1. The customer chooses `BANK_DEPOSIT` in checkout. The order is created as `PendingPayment` with a payment in `Pending` and a deadline from `FU_Payments_DepositWindow`.
2. The customer sees the bank account(s), the **reference = order number**, the exact amount and a countdown.
3. The customer deposits the money and uploads a proof (image or PDF) with the bank reference, date and deposited amount. The payment becomes `UnderReview` and the reservation stops expiring.
4. An Operator reviews the queue, opens the proof and **approves** (the order becomes `Paid`, stock is decremented, a ledger charge is written) or **rejects** with a mandatory reason.
5. After a rejection the order stays `PendingPayment`. The customer sees the reason and may upload another proof, up to `MaxDepositAttempts` (3) and within the window (resumed with `MAX(current, now + RejectionGraceHours)`). When attempts run out, the order is cancelled and everything is released.

The sequence diagram is in the [high-level design](../architecture/02-hld.md#bank-deposit-delivery-phase-1).

## Rules

| Rule | Mechanism |
|---|---|
| Exact amount | `DepositedAmount = Payments.Amount`; there are no partial approvals |
| The same bank slip cannot be reused | `UX_PaymentDeposits_Reference` on `(IDBankAccount, ReferenceNumber)` while `IsCurrent = 1` |
| The same file cannot be reused | SHA-256 not present in another `UnderReview` or `Approved` payment (`422 PAYMENT_PROOF_REUSED`) |
| Maximum attempts | `MaxDepositAttempts` = 3 |
| Window | 24 h capped by delivery date; not offered with less than 2 h available (`422 DEPOSIT_UNAVAILABLE_FOR_DATE`) |
| Review does not expire | A payment `UnderReview` is never expired by the job |
| Concurrent operators | The second approval is an idempotent no-op (422 if it was already rejected) |
| Seed accounts | Two fictitious accounts (one checking, one savings), clearly marked as examples |

## Proof upload security

Size limit 5 MB, validation by magic bytes (JPEG, PNG, PDF), opaque UUID storage key, private volume, authenticated download with `nosniff` and `Content-Security-Policy: sandbox`, compensation if the database fails after saving. Details in [security](../architecture/05-security.md#payment-proof-uploads) and [ADR-0018](../adr/0018-storage-of-payment-proofs.md). A human decides whether the content is genuine.

## Review queue

`GET /admin/payments/deposits` is paginated, sorted and filtered on the server and reads `VW_Payments_PendingDeposits` (age in hours). The UI flags a mismatching amount and an age over 24 h.
