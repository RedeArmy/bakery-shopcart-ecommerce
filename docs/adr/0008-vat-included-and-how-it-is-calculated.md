# ADR-0008: VAT included and how it is calculated

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Published prices include the 12 % Guatemalan VAT. Totals and the VAT component must always add up to the cent.

## Decision

Prices are VAT-inclusive. `VatCents = HalfEvenDivision(TotalCents × 12, 112)` and `BaseCents = TotalCents − VatCents`, so `Base + Vat = Total` by construction. The rate lives in `Configuration` as the integer 12. A `CHECK` on `Orders` guards the identity.

## Consequences

- Subtracting instead of rounding the base avoids one-cent mismatches.
- Changing the rate or the rounding policy is a localised change.

## Alternatives considered

- Computing base and VAT independently with rounding: can leave a cent unaccounted for.

## Links

- [Design v3 §1.4 D8 and §13.3](../design/source/DISENO_SHOPCART_v3.md)
- [ADR-0019](0019-half-even-rounding-and-integer-arithmetic.md)
