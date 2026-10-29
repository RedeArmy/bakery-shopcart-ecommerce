# ADR-0013: Cart with absolute quantities

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Cart updates are repeated by double clicks and retries. A relative operation ("add one") would change the result each time.

## Decision

The cart API sets absolute quantities: `PUT /cart/items/{variantId}` with the desired quantity (1 to 99) and `DELETE` to remove. Repeating the request yields the same state, so it needs no idempotency key. The cart stores no price: the current price is read when needed. Guest carts use a token; checkout requires login and merges the guest cart at sign-in.

## Consequences

- No idempotency machinery for the cart.
- A price change is visible immediately in the cart and frozen only when the order is created.

## Alternatives considered

- Increment/decrement endpoints: not idempotent.

## Links

- [Design v3 §9.1 and D11](../design/source/DISENO_SHOPCART_v3.md)
