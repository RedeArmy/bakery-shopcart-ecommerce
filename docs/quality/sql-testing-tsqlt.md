# SQL testing with tSQLt

All critical logic lives in procedures, functions, views and triggers, so it is tested **in the database** and not only through the API ([ADR-0023](../adr/0023-sql-tests-with-tsqlt-in-ci-only.md)).

## Three complementary layers

| Layer | Tool | Good for | Not for |
|---|---|---|---|
| A. SQL unit | **tSQLt** | Functions (`FU_Money_*`), views, the logic of each procedure, state and immutability triggers, permissions. Each test runs in a transaction that rolls back: fast and isolated | Concurrency (everything runs in one session) |
| B. Integration and concurrency | Vitest + Testcontainers through `executeProcedure` | N simultaneous connections: stock, coupons, duplicate approvals, idempotency | Fine isolation of one function |
| C. Differential TS ↔ SQL | fast-check + Vitest | Thousands of random inputs: `divRoundHalfEven` (TS) must equal `FU_Money_HalfEvenDivision` (SQL), and largest-remainder allocation must sum exactly | Business rules |

## Layout

```
db/tests/
├─ tsqlt/
│  ├─ install/            # tSQLt vendored (fixed version, with checksum) + enable CLR
│  ├─ 010_Test_Money.sql
│  ├─ 020_Test_Inventory.sql
│  ├─ 030_Test_States.sql          # order and payment
│  ├─ 040_Test_Immutability.sql    # ledger, audit log, amounts
│  ├─ 050_Test_Coupons.sql
│  ├─ 060_Test_Payments.sql        # ConfirmPayment, deposit approve/reject
│  ├─ 070_Test_Permissions.sql
│  └─ 080_Test_Reconciliation.sql
└─ scripts/
   ├─ run-tsqlt.ts        # installs tSQLt, runs RunAll, exports JUnit XML
   └─ sp-coverage.ts      # lists procedures without any tSQLt test
```

## Design rules

1. **tSQLt never ships in the delivered database.** The CI job creates `ShopCart_CI`, migrates from scratch, runs `db:verify` and **only then** installs tSQLt. A guard test (`070_Test_Permissions`) and a step of the image job verify the `docker compose up` database has no `tSQLt` schema and `clr enabled = 0`.
2. **`FakeTable` only isolates logic.** It removes constraints and triggers, so tests of `CHECK`, `UNIQUE`, `FOREIGN KEY` and triggers (`TR_*`) use the **real tables** with `SetUp` data and rely on tSQLt rollback. When a trigger is needed on a faked table, use `tSQLt.ApplyTrigger`.
3. **One test class per module** (`Test_Money`, `Test_Inventory`, …) with behaviour-describing names: `[test SP_Payments_ConfirmPayment is idempotent]`.
4. **Controlled clock.** Time-dependent procedures take `@Now` as a parameter (or use `tSQLt.FakeFunction` over the clock function), so reservation expiry and the deposit window are tested without waiting.
5. **Each test owns its data:** `SetUp` creates product, variant, user and minimal stock; it does not depend on the `S####` seed.
6. **Procedure coverage:** `sp-coverage.ts` compares `sys.procedures` with the tests. Critical procedures (inventory, checkout, payments, returns, money) **break CI** without a test; the rest only warn.

## Minimum case catalogue

| Class | Cases that must exist |
|---|---|
| `Test_Money` | Half-even ties (`2454.5 → 2454`, `2455.5 → 2456`); non-tie remainders round correctly; `Vat + Base = Total` for totals from 1 to 100 000 cents; largest-remainder allocation sums exactly; partial refunds 3333 + 3333 + 3334 = 10000; invalid domain (`@D <= 0`) fails |
| `Test_Inventory` | Reserve with enough and insufficient stock; `Reserved <= OnHand` always (`CHECK`); release on expiry; the ledger exit happens only on payment approval; a return restores once per line |
| `Test_States` | Every valid order transition (see [state machines](../architecture/04-state-machines.md)) passes and every invalid one fails with the expected error; same for payments; history records each change |
| `Test_Immutability` | `UPDATE` and `DELETE` on `FinancialMovements`, `AuditLog`, order amounts, `OrderLines` and `Payments` fail |
| `Test_Coupons` | Expired, exhausted, duplicate per order, usage cap, voiding on cancel or expiry |
| `Test_Payments` | `ConfirmPayment` twice → one ledger charge (`UX_FinancialMovements_OneChargePerPayment`); repeated bank reference rejected (`UX_PaymentDeposits_Reference`); amount different from the exact one rejected; an orphan payment creates a refund; rejection respects `MaxDepositAttempts` |
| `Test_Permissions` | With the application login: `EXECUTE` on a procedure works; direct `SELECT`, `INSERT`, `UPDATE`, `DELETE` on a table fail |
| `Test_Reconciliation` | After a full scenario (purchase, payment, partial return, cancellation) `VW_Reconciliation_Amounts` and `VW_Inventory_Reconciliation` return 0 rows |
| Migrations (script) | Apply V0001..N from scratch; reapply unchanged; modify an applied `V####` → `db:verify` fails; change an `R####` without raising the header version → lint fails |

## Example test

```sql
EXEC tSQLt.NewTestClass 'Test_Money';
GO
CREATE OR ALTER PROCEDURE Test_Money.[test HalfEvenDivision on a tie goes to the even cent]
AS
BEGIN
    DECLARE @Discount1 BIGINT = (SELECT Result FROM dbo.FU_Money_HalfEvenDivision(24545 * 1000, 10000)); -- 2454,5 -> par: 2454
    DECLARE @Discount2 BIGINT = (SELECT Result FROM dbo.FU_Money_HalfEvenDivision(24555 * 1000, 10000)); -- 2455,5 -> par: 2456

    EXEC tSQLt.AssertEquals @Expected = 2454, @Actual = @Discount1;
    EXEC tSQLt.AssertEquals @Expected = 2456, @Actual = @Discount2;
END;
GO
```

Trigger and procedure tests follow the same pattern (`SetUp` → execute → `tSQLt.ExpectException` / `AssertEqualsTable`).

## Spike result (29 October 2026)

**tSQLt installs and runs on the Linux SQL Server image, so plan B is not needed.** It was checked on Docker Desktop for Windows (WSL2 backend), with the same image that CI uses.

| Item | Result |
|---|---|
| Image | `mcr.microsoft.com/mssql/server:2022-latest`, SQL Server 2022 CU27 (16.0.4305.5), Ubuntu 22.04, x64 |
| Starting point | `clr enabled = 0` and `clr strict security = 1`, the most demanding case |
| Version to pin | **tSQLt 1.0.8083.3529** (Apache 2.0). The release notes of 1.0.8043 state that tSQLt is certified for SQL Server on Linux |
| Installation | `PrepareServer.sql` (as `sa`) enables CLR and installs the assembly key; then `tSQLt.class.sql` in the database. No errors |
| Result | Assembly `tSQLtCLR` with permission set `SAFE_ACCESS`; the database is **not** `TRUSTWORTHY` |
| Tests | 8 cases: 7 passed and the deliberate failure was reported as `Failure`. Five consecutive runs gave 7/7 |
| CI gate | `sqlcmd -b` returns exit code 1 when a test fails and 0 when all pass |
| Report | `tSQLt.SetTestResultFormatter 'tSQLt.XmlResultFormatter'` followed by `RunAll` writes JUnit-style XML (`testsuites`, one `testsuite` per class) |
| Money | `FU_Money_HalfEvenDivision` passed the golden values: ties `2454,5 → 2454` and `2455,5 → 2456`, VAT of Q112.00 is Q12.00, refunds 3333 + 3333 + 3334 |

Checksums of the files to vendor in `db/tests/tsqlt/install` (SHA-256):

| File | SHA-256 |
|---|---|
| `tSQLt.class.sql` | `f77453e00490491128b2bc0abbfa63c7b833c5207b31106f5cb8dc1ae741d401` |
| `PrepareServer.sql` | `440fc3a5b67ccbe901f225ffe0ff2350834ba82121a8caa54032f300fa255958` |
| `License.txt` | `1977f3ee406e85088b107e97bcceface66fb3e137704457acf441a262dfd9c88` | <!-- spelling-ignore -->
| Downloaded `tSQLt_V1.0.8083.3529.zip` | `af841f357dd9189f8b197c34c5014fe0dbabd3be34b024ed46967dafe13d4f50` |

The official download is `https://tsqlt.org/download/tsqlt/`; the GitHub repository publishes no release assets.

### Lessons for writing the tests

1. **`IDENTITY` values are not rolled back.** The transaction that tSQLt rolls back after each test does not reset identity counters, so a test must never assume `IDVariant = 1`. Read the key it just inserted or operate without filtering by it. This broke a spike test as soon as another test inserted a row first.
2. **Test order is not fixed.** The same suite ran in different orders, which is why isolation problems like the one above show up intermittently.
3. **Parameters cannot be expressions.** `tSQLt.AssertEquals @Actual = (SELECT …)` is a syntax error; assign the value to a variable first.
4. **`sqlcmd -h` and `-y` are mutually exclusive.** To capture the XML use `-y 0 -o <file>` without `-h`.
5. **Tests that exercise a `CHECK`, `UNIQUE` or trigger use the real tables.** `FakeTable` removes constraints, as designed above, and the spike confirmed it ignores a `CHECK` that the real table enforces.

## Risks and mitigation

- **tSQLt requires CLR.** The spike validated it on the Linux SQL Server image and Docker Desktop (WSL2), so it is no longer a risk. **Plan B,** kept only as a reference: write the same assertions as Vitest tests calling the procedures through `executeProcedure` (layer B covers them); the case catalogue does not change.
- **Time.** The framework base takes three to four hours; the rest is added per module with each procedure (rule: a critical procedure is not done without its test).
- **Test data in the CI database.** It is destroyed at the end of the job and never reused.

`npm run sql:test` also works locally against the development container (Windows or Linux), so an evaluator can run it without CI.
