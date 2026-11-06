# ADR-0027: Guest accounts for checking out without registering

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

The design (decision D11) said "the checkout requires login, no anonymous payments", and the first frontend followed it: a coupon and the checkout needed an account. The owner decided that a shopper must be able to apply a coupon and finish a simple order **without creating an account**, while personalisation (the message written on a cake) and made-to-order products stay behind an account.

Everything below the cart hangs from an `IDUser`: the active cart, the reservation, the order, the payment and its proofs, the addresses and every ownership check that stops a customer from seeing another customer's data (a direct penalty in the brief). A guest order without an owner would mean changing almost all of that, and a hole in any ownership check is the worst possible mistake.

## Decision

We will give a guest an **account without a password** instead of an order without an owner.

- **A guest is a `Users` row** with `IsGuest = 1` (migration V0013): role Customer only (`CK_Users_GuestIsCustomer`), an invented email `guest-<id>@guest.invalid` until the real one is given, and a password hash that no hash function produces. It never logs in by email (`SP_Users_GetByEmail` skips guests) and does not appear in the user list. Everything that is "of an `IDUser`" works for a guest exactly as for a customer.
- **The session is created when it is needed**, not before: `POST /auth/guest` opens a guest session (access token plus the refresh cookie) when the visitor applies a coupon or continues as a guest at checkout. The visitor cart (`X-Cart-Token`) is merged into the guest account with the existing `POST /cart/merge`. A visitor who only looks at the cart creates nothing.
- **Contact data before ordering.** `PUT /auth/guest/contact` saves name, email and phone. `SP_Orders_CreateOrder` refuses a guest without a real email (`GUEST_CONTACT_REQUIRED`). An email that belongs to a registered account is refused (`EMAIL_BELONGS_TO_ACCOUNT`): accepting it would let anyone act as the account holder. Several guests may share an email, and someone may register later with the email used as a guest, because the email is unique only among real accounts (filtered unique index).
- **Coupons count by email.** A coupon limited to one use per customer counts the usages of every account with the same email (`FU_Coupons_Status`), so creating another guest does not restart the limit. A guest that has not given an email yet counts alone; the limit is checked again when the order is created.
- **Personalisation and made-to-order products need an account.** A made-to-order product is one with `LeadTimeDays > 0`, the criterion the shop already uses to say "made to order". `SP_Cart_SetItemQuantity` answers `ACCOUNT_REQUIRED` to a visitor or a guest who sends an inscription or asks for such a product; `SP_Inventory_ReserveStock` repeats the check for a guest cart (a product can become made to order after it was added). The rule lives in the database; the screens only avoid offering what would fail.
- **Recovering the order.** A guest with a contact email can ask for a recovery code (`POST /auth/guest/recovery-code`): ten characters of a 32-symbol alphabet (50 bits), shown once, stored as SHA-256, replaced by each new code. With the email and the code, `POST /auth/guest/recover` returns the guest session on another device. An unknown email and a wrong code answer the same 401, the comparison covers all candidates in constant time, and the route has the rate limit of sign in. The order number is not used because it is sequential.
- **From guest to account.** The cart of a guest is a different cart from the one of the account that is created later. When a guest session ends in a sign in or a registration, the frontend passes the products (not the coupon nor the personalisation) to the new account.
- **Idempotency.** The three guest calls that return a token or a secret code are exempt from `Idempotency-Key`: replaying a stored response would keep the secret in clear in the idempotency store.

## Consequences

- No change to carts, reservations, orders, payments or addresses, and no new way to read someone else's data: the same ownership checks apply. One migration, four procedures and small changes to ten others, with 29 tSQLt tests and an HTTP flow.
- A guest can use a coupon, check out with a deposit and recover the order; it cannot personalise or order made-to-order products, which is what the owner asked for.
- Guest accounts accumulate. A visitor can create them at the rate of the authentication limit (5 per minute per address in Express, 10 per minute at the edge). A retention rule that removes old guests without orders is pending (see the open questions).
- A guest who loses the browser session and the recovery code cannot reach the order; they can still contact the shop with the order number.
- The design document (D11) is outdated on this point; the open question records the conflict and this ADR wins.

## Alternatives considered

- **An order without an owner, consulted with a link or a code.** Changes the cart, the reservation, the payment, the proofs and the address, and every ownership check would need a second identity. Too large and too risky before the delivery.
- **No restriction on the coupon per customer for guests.** Simpler, but a limit of one use per customer would mean nothing. Counting by email is cheap and keeps it meaningful.
- **Recovery with the order number and the email.** The order number is sequential, so with a known email it can be guessed; a random code removes that.

## Links

- [Frontend design, the cart and the checkout](../architecture/06-frontend-lld.md#the-cart)
- [Stored procedure catalogue, guest accounts](../database/stored-procedure-catalogue.md#guest-accounts-built)
- [Migration register, V0013](../database/migration-register.md)
- Related: [ADR-0026](0026-refresh-token-in-an-httponly-cookie.md), [ADR-0013](0013-cart-with-absolute-quantities.md)
