# Money handling

> Challenge constraint: *amounts and volumes use `DECIMAL` or `INTEGER` with defined precision; `FLOAT` and `REAL` are not allowed.*
> **Goal: not a single cent is lost or created.** Every amount is calculated once, in integers, with an explicit rounding policy, and every allocation sums exactly to its total.

## Principles

| # | Principle | How it applies here |
|---|---|---|
| 1 | Never floating point for money | A JavaScript `number` is an IEEE-754 double (`0.1 + 0.2 ≠ 0.3`). Forbidden in any monetary calculation |
| 2 | Fixed point or integers in the minor unit (cents) | Procedure calculations use `BIGINT` cents; tables store `DECIMAL(18,2)` |
| 3 | Money always has a currency | `Money(cents, currency)`; adding different currencies throws; today only `GTQ`, with `CHECK (Currency = 'GTQ')` |
| 4 | One explicit, documented rounding policy | Half-even, in one function |
| 5 | Round as little as possible, and last | Price × quantity is exact; no intermediate rounding |
| 6 | Conservation: the sum of the parts is the whole | Largest-remainder allocation; exact closing on the last returned unit |
| 7 | Monetary facts are immutable | Immutability triggers and an append-only ledger |
| 8 | Continuous reconciliation | `VW_Reconciliation_Amounts` and a daily job |
| 9 | Amounts travel as text or integers, never as JSON numbers | `"145.00"` in the API ([ADR-0020](../adr/0020-amounts-as-decimal-strings-in-the-api.md)) |
| 10 | Every change is audited | Audit log with previous and new values as decimal text |

## Types and precision

| Datum | Type | Reason |
|---|---|---|
| Amounts (price, total, discount, shipping, VAT, refund) | `DECIMAL(18,2)` | Up to 9 999 999 999 999 999.99; scale 2 is the quetzal cent (ISO 4217) |
| Calculations inside procedures | `BIGINT` cents | Exact integer arithmetic, no implicit scale rules |
| Coupon percentages | `DECIMAL(18,2)` (0 to 100) and, inside procedures, **basis points** (`pct × 100`) | `12.50 %` → `1250` |
| VAT rate | Integer `12` in `Configuration` | Used as the fraction `12/112` |
| Quantities | `INT` | |

**Forbidden in SQL (CI lint over `db/`):** `FLOAT`, `REAL`, `MONEY`/`SMALLMONEY` (only four decimals, they lose precision in intermediate multiplication and division), scientific notation (`1e-2` is a `FLOAT` in T-SQL) and `AVG()` over amounts (it returns scale 6 with no rounding rule; compute `SUM / COUNT` with half-even division).

**`DECIMAL` traps avoided by using integers:** the scale of a division result (at least six decimals, silently truncated beyond precision 38), operation order (dividing before multiplying loses precision) and `CAST` to a smaller scale rounding while `ROUND(x, 2, 1)` truncates.

## Rounding policy: half-even (banker's)

**One rule: half to even, to the cent, once per operation, on integers.** `HalfEvenDivision(n, d)` is the integer division of `n` by `d` rounded to the nearest integer; on an exact tie (the fraction is exactly 0.5) it picks the **even** integer.

| Calculation | Formula in integer cents | Rounding |
|---|---|---|
| Line | `PriceCents × Quantity` | None (exact) |
| Percentage discount | `HalfEvenDivision(EligibleCents × PctBp, 10000)` | Half-even, once |
| Fixed-amount discount | `MIN(ValueCents, EligibleCents)` | None |
| **VAT included in the total** | `VatCents = HalfEvenDivision(TotalCents × 12, 112)` | Half-even, once |
| Taxable base | `BaseCents = TotalCents − VatCents` | By subtraction: `Base + Vat = Total` always |
| Shipping | Value from `Configuration` | None |
| Total | `MAX(0, Subtotal − Discount) + Shipping` | None |
| Average ticket | `HalfEvenDivision(SumCents, N)` | Half-even, once (`N > 0`) |
| Proportional refund of a line | `HalfEvenDivision(LineTotalCents × q, Sold)`; on the **last** pending unit: `LineTotal − previously refunded` | Half-even and exact closing |
| Recurrente fee | `fee` arrives in integer cents; stored as `fee / 100` exactly | None |

**Why half-even?** It removes the statistical bias when **many rounded values are summed**: sales reports, fees, average ticket and partial refunds. With half-up every tie rises and the accumulated total inflates systematically; with half-even ties go up and down in equal measure. It is the IEEE 754 default and the rule of accounting and banking.

**Trade-off to know:** to an end customer it may look counter-intuitive (`10 %` of `Q1.25` = `Q0.125` → `Q0.12`, not `Q0.13`). It only affects **exact half-cent ties**. If electronic invoicing (FEL) is ever added, the rule required by that regime must be checked against its specification before reusing these amounts. Because the policy is in one function, changing it is a localised, versioned change ([ADR-0019](../adr/0019-half-even-rounding-and-integer-arithmetic.md)).

```sql
-- R0050__FU_Money_HalfEvenDivision.sql (función de tabla en línea, según el estándar FU_)
-- Divide n entre d (n >= 0, d > 0) y redondea al entero más cercano; en empate exacto elige el par.
CREATE OR ALTER FUNCTION dbo.FU_Money_HalfEvenDivision (@N BIGINT, @D BIGINT)
RETURNS TABLE AS RETURN
  SELECT Result = q.Quotient
                + CASE WHEN 2 * q.Remainder > @D THEN 1                -- fracción > 0,5: sube
                       WHEN 2 * q.Remainder = @D THEN q.Quotient % 2   -- empate exacto: sube solo si el cociente es impar (queda par)
                       ELSE 0 END                                      -- fracción < 0,5: baja
  FROM (SELECT Quotient = @N / @D, Remainder = @N % @D) AS q;
-- Uso: CROSS APPLY dbo.FU_Money_HalfEvenDivision(@TotalCents * 12, 112) AS vat
```

```ts
// shared-kernel/rounding.ts — misma política en TypeScript (oráculo de pruebas y validaciones)
export function divRoundHalfEven(n: bigint, d: bigint): bigint {
  if (n < 0n || d <= 0n) throw new RangeError('Domain: n >= 0 and d > 0');
  const quotient = n / d;
  const twiceRemainder = (n % d) * 2n;
  return twiceRemainder > d ? quotient + 1n : twiceRemainder < d ? quotient : quotient + (quotient % 2n); // empate: al par
}
```

## Exact allocation by largest remainder

A category discount is distributed across eligible lines. **Allocating "the remainder to the last line" always biases the same line**; the standard (the *money allocation* pattern) is the **largest-remainder method**: deterministic, with an exact sum. Example: Q10.00 across three equal lines gives `3.34 + 3.33 + 3.33 = 10.00`.

```sql
-- Dentro de SP_Orders_CreateOrder y FU_Coupons_DiscountCalculation
-- @Lines(IDLine INT, WeightCents BIGINT): importe elegible de cada línea, en centavos
-- Todo entero: la división y el módulo son exactos. Cota: totales < Q10,000,000 => producto < 1e18 < 9.22e18 (BIGINT)
WITH Base AS (
  SELECT IDLine, WeightCents,
         Prod = @DiscountCents * WeightCents,
         Total = SUM(WeightCents) OVER ()
  FROM @Lines
), Floors AS (
  SELECT IDLine, FloorCents = Prod / Total, Remainder = Prod % Total FROM Base      -- división entera exacta
), Ranked AS (
  SELECT IDLine, FloorCents,
         Missing = @DiscountCents - SUM(FloorCents) OVER (),                       -- siempre < nº de líneas
         Position = ROW_NUMBER() OVER (ORDER BY Remainder DESC, IDLine ASC)         -- desempate determinista
  FROM Floors
)
SELECT IDLine,
       DiscountCents = FloorCents + CASE WHEN Position <= Missing THEN 1 ELSE 0 END  -- Σ = @DiscountCents exacto
FROM Ranked;
```

A `CHECK` cap (`Total < 10^9` cents) protects the overflow bound; exceeding it answers `422`.

## Worked example, cent by cent

Illustrative order: line **A** Q145.00 ×1, line **B** Q45.00 ×1, line **C** Q55.45 ×1, with a 10 % coupon on the whole cart.

| Step | Calculation | Result |
|---|---|---|
| Subtotal | `14500 + 4500 + 5545` | `24545` cents = **Q245.45** |
| 10 % discount | `HalfEvenDivision(24545 × 1000, 10000)` = `2454.5` → **exact tie**, quotient `2454` is even | **`2454`** = Q24.54 (half-up would have given Q24.55) |
| Allocation floors | `A = 1449`, `B = 449`, `C = 554` (sum 2452) | **2** cents missing |
| Remainders | `B = 22 295`, `A = 17 295`, `C = 9 500` | The 2 cents go to **B** and **A** |
| Discount per line | `A = 1450`, `B = 450`, `C = 554` | Sum **2454** ✓ |
| Total per line | `A = 13 050`, `B = 4 050`, `C = 4 991` | Sum **22 091** = `24 545 − 2 454` ✓ |
| Shipping | `22 091 < 30 000` → **Q25.00** | `2500` |
| **Total** | `22 091 + 2 500` | **`24 591`** = **Q245.91** |
| VAT included | `HalfEvenDivision(24591 × 12, 112)` = `295 092 / 112` = `2634.75` → rounds up | **`2635`** = Q26.35 |
| Taxable base | `24 591 − 2 635` | **`21 956`** = Q219.56; `Base + Vat = Total` ✓ |

**Partial return without losing cents:** a line of 3 units with `LineTotal = Q100.00` (`10000`). Returning 1 unit: `HalfEvenDivision(10000 × 1, 3)` = `3333` → Q33.33. Returning another: `3333`. The **last** pending unit refunds `10000 − 3333 − 3333` = **`3334`** → Q33.34. Total refunded: **exactly Q100.00**.

## The boundary with the outside world

**API and OpenAPI:** amounts are **not JSON numbers**. They are sent as a **decimal string with exactly two decimals** plus currency:

```yaml
Money:
  type: object
  required: [amount, currency]
  properties:
    amount: { type: string, pattern: '^\d{1,16}\.\d{2}$', example: '145.00' }
    currency: { type: string, enum: [GTQ] }
```

**TypeScript `Money` with `BigInt`:**

```ts
// shared-kernel/money.ts — sin number, sin parseFloat, sin toFixed
export class Money {
  private constructor(readonly cents: bigint, readonly currency: 'GTQ') {}

  static fromDecimalString(value: string): Money {
    if (!/^\d{1,16}\.\d{2}$/.test(value)) throw new AppError(400, 'INVALID_AMOUNT', 'Invalid amount format');
    const [whole, fraction] = value.split('.');
    return new Money(BigInt(whole) * 100n + BigInt(fraction), 'GTQ');
  }
  static fromCents(cents: bigint | number): Money {
    if (typeof cents === 'number' && !Number.isSafeInteger(cents)) throw new AppError(500, 'UNSAFE_AMOUNT', 'Unsafe integer');
    return new Money(BigInt(cents), 'GTQ');
  }
  toDecimalString(): string { return `${this.cents / 100n}.${(this.cents % 100n).toString().padStart(2, '0')}`; }
  toCents(): number { // solo para pasarelas que exigen entero (Recurrente: amount_in_cents)
    if (this.cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new AppError(500, 'UNSAFE_AMOUNT', 'Out of range');
    return Number(this.cents);
  }
  add(other: Money) { this.assertSameCurrency(other); return new Money(this.cents + other.cents, this.currency); }
  subtract(other: Money) { this.assertSameCurrency(other); return new Money(this.cents - other.cents, this.currency); }
  times(quantity: number) { if (!Number.isInteger(quantity)) throw new Error('Integer quantity'); return new Money(this.cents * BigInt(quantity), this.currency); }
  equals(other: Money) { return this.currency === other.currency && this.cents === other.cents; }
  private assertSameCurrency(other: Money) { if (other.currency !== this.currency) throw new Error('Different currencies'); }
}
```

The backend **does not calculate** totals or discounts: the database does. `Money` validates inputs, formats outputs, compares against gateway events and serves as the **test oracle**.

**SQL Server driver:** `mssql` materialises `DECIMAL` as a JavaScript `number` by default. To avoid introducing a `double`:

- **Outputs:** procedures return amounts as decimal text (`CONVERT(VARCHAR(20), Total)` → `'145.00'`) or as `BIGINT` cents. The repository maps directly to `Money`.
- **Inputs:** `DECIMAL(18,2)` parameters are built from `Money.toDecimalString()`. A **round-trip test** (`0.01`, `0.10`, `0.29`, `99 999 999 999.99`, `9 999 999 999 999 999.99`) confirms there is no loss. If the driver fails with some value, the parameter becomes `BIGINT` cents without touching the domain.

**Gateway:** Recurrente works in integer cents (`amount_in_cents`), which fits: `Money.toCents()` produces what it expects and `Money.fromCents(fee)` converts back without rounding.

## Conservation and reconciliation

**Ledger (`FinancialMovements`):** the money counterpart of the inventory ledger. Every charge, refund and fee is an **append-only** row with a sign (`Charge +`, `Refund −`, `Fee −`). The net of an order is the sum of its movements. Corrections are new movements, never edits.

**Immutability:** the triggers prevent changing `Subtotal`, `Discount`, `Shipping`, `Total`, `TaxableBase` or `Vat` of an order; the price, quantity and discount of a line; and the amount of a payment. The internal `CHECK` coherence rules stay in force: `Total = MAX(0, Subtotal − Discount) + Shipping`, `Base + Vat = Total`, `LineTotal = Quantity × Price − LineDiscount`. A price change in `Variants` only affects future orders and is audited with previous and new values as decimal text.

**Reconciliation (`VW_Reconciliation_Amounts`, must return 0 rows; a daily job and the tests check it):**

| Check | Condition |
|---|---|
| Order subtotal | `Orders.Subtotal = Σ (UnitPrice × Quantity)` of the lines |
| Discount | `Orders.Discount = Σ LineDiscount` |
| Total against payment | The `Approved` payment has `Amount = Orders.Total` |
| Ledger against payments | `Σ Charge` per payment = `Payments.Amount` of approved payments |
| Refunds | `Σ Refunds.Amount ≤ Payments.Amount`; and `Σ Refund` in the ledger = `Σ` processed refunds |
| Returns | `Returns.RefundAmount = Σ ReturnLines.RefundAmount`; a full return of a line equals its exact `LineTotal` |
| Fees | `Σ Fee` in the ledger = `Σ Payments.ProviderFee` |
| Inventory | `OnHandStock = Σ ledger` |
| Coupons | `Coupons.CurrentUses = COUNT(CouponUsages WHERE IsVoided = 0)` |

A non-zero result writes an audit entry and raises an alert in the Administrator panel.

## Tests and automatic guard rails

| Control | Detail |
|---|---|
| **Property tests** (`fast-check`) | For thousands of random inputs: allocation sums to the total; no element differs from the exact value by more than 1 cent; `Base + Vat = Total`; `fromDecimalString(toDecimalString(m)) = m`; `Σ partial refunds = LineTotal` |
| **Golden values** | `0.10 + 0.20 = 0.30` exactly; `10.00 / 3 → [3.34; 3.33; 3.33]`; VAT of `Q112.00 = Q12.00`; the full example above; exact ties to even: 10 % of `Q1.25 → Q0.12` and 10 % of `Q1.35 → Q0.14`; VAT of `Q0.01 → Q0.00` and of `Q0.05 → Q0.01`; discount larger than subtotal → total `Q0.00` plus shipping |
| **Differential TS vs SQL** | `divRoundHalfEven` and `allocate` (TypeScript oracles) are compared with the procedure results over the same random inputs. Any difference fails the test |
| **SQL lint in CI** | Fails on `FLOAT`, `REAL`, `MONEY`, `SMALLMONEY` or scientific notation in `db/` |
| **TypeScript lint** | `no-restricted-syntax` in monetary modules: forbids `parseFloat`, `Number()` over amounts, `toFixed` and `*` `/` operators over amounts outside `Money` |
| **Contract** | The OpenAPI `Money` schema rejects JSON numbers; Schemathesis exercises it |
| **Reconciliation** | `VW_Reconciliation_Amounts` is empty at the end of load and concurrency tests |
