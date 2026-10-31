# Database: performance benchmark

**Responsibility:** the volume that `npm run sql:bench` loads and the figures it checks.

**May contain:** SQL that loads data into `ShopCart_Bench`.

**Must not contain:** anything that runs against the delivered database or the tSQLt one (`bench-seed.sql` inserts with `sa` and skips the procedures on purpose; `run-bench.ts` refuses a name that does not end in `_Bench`).

**Governing document:** [performance](../../../docs/operations/performance.md)

## Files

| File | What it does |
|---|---|
| `bench-seed.sql` | 50,000 orders, 75,000 lines, 20,300 guest carts, 200,000 refresh tokens, 200,000 audit rows, 60,000 stock movements and 20,000 approved deposits |
| `../scripts/run-bench.ts` | Migrates `ShopCart_Bench`, loads the seed once, runs each list and report twice and checks the logical reads and the time of the second run |

## Running it

```bash
npm run sql:test:up
```

```bash
npm run sql:bench
```

It exits with 1 when a list or report goes over its limit. The limits live in `run-bench.ts`, next to each case, and are about three times what was measured on 30 October 2026.
