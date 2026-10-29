# ADR-0020: Amounts as decimal strings in the API

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Many JSON clients parse numbers as doubles, which reintroduces floating-point errors at the boundary.

## Decision

Amounts travel as strings with exactly two decimals plus a currency (`{ "amount": "145.00", "currency": "GTQ" }`), pattern `^\d{1,16}\.\d{2}$`. The frontend formats them with `Intl.NumberFormat` from the string and never computes with them. Clients send identifiers, never amounts. The `mssql` driver returns `DECIMAL` as `number`, so procedures return amounts as text or as `BIGINT` cents and the repository maps them to `Money`.

## Consequences

- The OpenAPI schema rejects JSON numbers; Schemathesis exercises it.
- A round-trip test covers values such as 0.01, 0.29 and 9 999 999 999 999 999.99.

## Alternatives considered

- JSON numbers: lossy in some clients.
- Integer cents in the API: fine technically but less readable and easy to misformat.

## Links

- [Design v3 §13.6 and D27](../design/source/DISENO_SHOPCART_v3.md)
