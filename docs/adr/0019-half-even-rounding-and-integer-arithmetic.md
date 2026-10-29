# ADR-0019: Half-even rounding and integer arithmetic

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The brief forbids `FLOAT` and `REAL` and requires no rounding errors. JavaScript `number` is an IEEE-754 double. SQL Server `DECIMAL` division has surprising scale rules.

## Decision

Tables store `DECIMAL(18,2)`; every calculation runs in `BIGINT` cents. There is one rounding policy, half-even (banker's), implemented once in SQL as `FU_Money_HalfEvenDivision` and once in TypeScript as `divRoundHalfEven`, applied once per operation on integers. Discounts are allocated across lines by the largest-remainder method with the `IDLine` tie-break, so parts always sum to the total. The last returned unit refunds the remainder of the line. `FLOAT`, `REAL`, `MONEY`, `SMALLMONEY`, scientific notation and `AVG()` over amounts are rejected by lint.

## Consequences

- Half-even only differs from half-up on exact half-cent ties, for example 10 % of Q1.25 gives Q0.12.
- If electronic invoicing (FEL) is added, its fiscal rule must be checked against this policy; changing it is a localised change.
- A differential test compares the TypeScript oracle with the SQL function on random inputs.

## Alternatives considered

- Half-up: biases totals upwards when many rounded values are summed.
- `MONEY`: four decimals and lost precision in intermediate operations.

## Links

- [Design v3 §13](../design/source/DISENO_SHOPCART_v3.md)
- [money-handling.md](../database/money-handling.md)
