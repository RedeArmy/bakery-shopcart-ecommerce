# ADR-0005: The server never takes cards: own deposit flow and hosted card checkout

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The brief does not mention payment gateways; payment methods are a differentiator that must not put the mandatory scope at risk. Handling card data would bring PCI scope and secrets into the application.

## Decision

The server never collects or charges cards. Bank deposit is a first-class, always-available method that we own end to end (proof upload, human review). Card payments use the hosted checkout of Recurrente, confirmed through signed webhooks, return verification and a reconciliation job (Delivery Phase 2). Without valid Recurrente credentials only bank deposit is offered, in the UI and enforced by the backend (`422 PAYMENT_METHOD_UNAVAILABLE`).

## Consequences

- No card data touches the system; the double-charge risk is controlled by one open attempt per order, one approved payment per order and webhook deduplication.
- The delivered environment works without credentials; the card flow is demonstrated with a local simulator or test keys.
- Late payments on cancelled orders become orphan payments that create a pending refund.

## Alternatives considered

- Collect cards in our own form: unacceptable security and compliance cost.
- Card only: fails in the delivered environment without credentials.

## Links

- [Design v3 §3.3 item 9, §12](../design/source/DISENO_SHOPCART_v3.md)
- [ADR-0017](0017-own-recurrente-adapter.md)
