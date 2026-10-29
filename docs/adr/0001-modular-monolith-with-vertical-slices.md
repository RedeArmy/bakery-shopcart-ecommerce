# ADR-0001: Modular monolith with vertical slices

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The checkout must create the order, its lines, the coupon usage, the stock reservation and the payment atomically. The team is one person with 15 days, and the challenge penalises features that do not run in the delivered environment. Capacity is modest (about 400 orders a day, peak ×10).

## Decision

Build one deployable backend organised as modules (vertical slices). Inside each module the dependency rule is `presentation → application → domain ← infrastructure`. Checkout, inventory, coupons, orders and payments receive the full DDD treatment; auth, catalogue, cart, dashboard, audit and users keep a light layered structure. Modules talk to each other only through their `index.ts`. `dependency-cruiser` enforces the rule in CI.

## Consequences

- A single transactional boundary keeps the checkout atomic.
- Boundaries are explicit, so a module can be extracted later if capacity requires it.
- The rule needs tooling (`arch:check` with a deliberate-violation self-test) to stay true.

## Alternatives considered

- Microservices: would break checkout atomicity and add operational cost with no benefit at this volume.
- A flat layered monolith: faster to start but boundaries erode and tests become harder.

## Links

- [Design v3 §1.4 D1 and §6](../design/source/DISENO_SHOPCART_v3.md)
