# ADR-0029: Payment methods maintained by an administrator, and cash on pickup

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

The checkout offered one way to pay, the bank deposit, and made the customer choose one of the bank accounts. The owner decided that the customer chooses a **payment method** instead; that an administrator **maintains the methods** (adds, edits, removes them and decides who sees each one); that **cash on pickup** exists, only for orders collected in a branch; that a delivery offers the deposit only; and that the bank accounts are **shown as text and not chosen**.

Two facts from the code shape the answer. The payment procedures treated the method as a constant (`IDPaymentMethod = 2` meant "deposit"), so a method created by an administrator would not behave like one. And the deposit stored the account it was made into, which the reference uniqueness used.

## Decision

- **A method has a kind, a text and a place.** `PaymentMethods` gains `Kind` (`Card`, `Deposit`, `Cash`), `Title`, `Description`, `AppliesToDelivery`, `AppliesToPickup` and `IsActive` (migration V0017). The kind decides how the payment is processed; the administrator decides the text and where it is offered. The card is not managed here: it depends on the credentials of the provider.
- **Cash is collected in the branch, so it is offered for pickups only.** A constraint (`CK_PaymentMethods_CashPickupOnly`), the procedures and the form all say it, so no client can create a cash method for deliveries.
- **"Removing" a method deactivates it** (`SP_PaymentMethods_Deactivate`), like the branches: payments already made cite it and keep following their course. An administrator can reactivate it.
- **The procedures recognise a deposit by its kind**, not by the identifier, so the methods an administrator creates behave like the ones of the seed.
- **The bank accounts are information.** The customer sees them as separated text blocks at the checkout and on the payment page (`GET /bank-accounts`) and does not choose one; the deposit does not record which one was used (`PaymentDeposits.IDBankAccount` allows NULL). The reference of a current deposit stays unique because in a unique index the NULL values count as equal.
- **A cash order stays pending until it is collected.** `SP_Orders_CreateOrder` creates the payment in `Pending` with no deposit row, expiring at the end of the estimated day (local time), so the existing expiry job cancels an order nobody paid. An operator or an administrator confirms the collection (`SP_Payments_ConfirmCash`, `POST /admin/payments/{id}/confirm-cash`), which reuses `SP_Payments_ConfirmPayment`: the order becomes paid and the stock leaves.
- **The checkout asks the server for what it offers** (`GET /checkout/payment-methods?fulfilment=`) and confirms with `idPaymentMethod`. The old `method` code is still accepted by the API.

## Consequences

- One migration, one seed, five new procedures and changes to nine existing ones; the existing callers keep working because the new parameters have defaults.
- There is no screen yet for the operator to confirm a cash payment: the operation exists in the API and its screen belongs to the order administration of Delivery Phase 2.
- A cash payment that is not collected by the end of the estimated day expires, and its order is cancelled by the same job as an unpaid deposit.
- A deposit no longer says in which account it was made: the review compares the proof with the accounts.

## Alternatives considered

- **Let the customer choose the account and keep recording it.** Rejected by the owner: the accounts are information.
- **Create a method of any kind from the form.** Rejected: a method with no behaviour behind it would be a label, so an administrator chooses between the kinds the system knows how to process.
