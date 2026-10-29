# ADR-0017: Own Recurrente adapter

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Recurrente is the card gateway. The available SDKs are not official, and its sandbox does not send webhooks.

## Decision

Write a small adapter with `fetch` behind `PaymentGatewayPort`, plus our own Svix signature verifier (HMAC-SHA256 over `id.timestamp.body`, constant-time comparison, five-minute tolerance). One line item for the order total in integer cents, currency GTQ. Confirmation uses three paths: signed webhook, verification when the customer returns, and a reconciliation job that queries the checkout. A local simulator (profile `payments-sandbox`) lets the same adapter run by changing only the base URL.

## Consequences

- Fewer dependencies and full control of timeouts, retries (reads only) and secret redaction.
- Unverified API points (expiry on creation, refund payload, closing a checkout, reuse after failure) are validated with test keys on the first day of Delivery Phase 2.

## Alternatives considered

- Unofficial SDK: less control and an extra supply-chain risk.

## Links

- [Design v3 §12.4 to §12.6 and D21 to D24](../design/source/DISENO_SHOPCART_v3.md)
