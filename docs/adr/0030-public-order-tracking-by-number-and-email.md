# ADR-0030: Public order tracking by number and email

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

A guest could generate a recovery code at the checkout and use it, with their email, to get their orders back on another device. The owner decided that this section goes away: the checkout already ends with an **order number**, so what is needed is a place on the home page where **anyone, with or without an account, checks the status of an order**.

The order number is consecutive (`PED-AAAA-NNNNNN`), so a lookup by the number alone would let anybody walk through all of them and learn when the shop sold something. The data it would give is little (a status and dates), but it is still the activity of the business and of a person.

## Decision

- **The lookup asks for the number and the email of the order** (`GET /orders/track?orderNumber=&email=`, no session). Both are things only the customer knows: they received the number and they gave the email when ordering (a guest cannot order without one). It is a decision of the design, not of the brief; asking only for the number is a one-line change in `SP_Orders_Track` if the owner prefers it.
- **It returns the least possible**: the status, the creation and estimated dates, the way of receiving and the branch name, and the history of statuses (status and date). No name, address, product, amount or contact.
- **A wrong email answers like a number that does not exist** (`404`, the same code and message), so the lookup cannot be used to learn which numbers exist.
- **It is rate limited by IP** (10 per minute, `orderTracking`) because it has no session to count on, and the email is compared in the database (`SP_Orders_Track`), case-insensitively.
- **The recovery code section is removed from the checkout and the payment page.** The route `/recover` and the API that issue and redeem the code remain for now: nothing in the interface feeds them, and removing them is a separate decision.

## Consequences

- One new procedure (`SP_Orders_Track`, `R0307`), one operation (89) and one section on the home page; no migration.
- A guest who loses the order number cannot find it again from here: the number is on the confirmation screen and in the order detail of a customer with an account.
- The contact section of the guest stays: the name and the email are required (the server refuses a guest order without them), and a customer with an account is never asked for them.

## Alternatives considered

- **Number only.** Rejected for the reason above: consecutive numbers can be enumerated.
- **A tracking link with a long random token.** Better against guessing, but it needs a new table and an email to deliver the link, which the project does not send.
