# Definition of done

A change is done when every applicable item below is true.

## For every change

- [ ] `npm run lint` passes (ESLint, Prettier, cspell en-GB, British spelling, README sync, SQL file names).
- [ ] `npm run typecheck`, `npm test` and `npm run arch:check` pass.
- [ ] British English everywhere except code comments, which are Spanish and explain the why.
- [ ] No secrets, no `.env`, no uploaded files in the commit; `gitleaks` is clean.
- [ ] Conventional Commit message in English; small, readable commits.
- [ ] `docs/progress/STATUS.md` updated at the end of the session; decisions logged, ADR written when architectural.

## Database

- [ ] No `FLOAT`, `REAL` or `MONEY`; amounts are `DECIMAL(18,2)`; calculations in `BIGINT` cents.
- [ ] Names follow `SP_`, `VW_`, `FU_`, `TR_` and `ID<Entity>`; constraints use the standard prefixes.
- [ ] Applied migrations untouched; changed objects raised their header version.
- [ ] Invariants have `CHECK`, `UNIQUE`/filtered indexes or triggers; multi-table work uses one transaction.
- [ ] A tSQLt test exists for each critical procedure; `npm run sql:coverage` passes.
- [ ] The delivered database has no `tSQLt` schema; the application login has `EXECUTE` only.

## Backend

- [ ] No ORM, no SQL in TypeScript; only `executeProcedure` with typed parameters, called only from `infrastructure/`.
- [ ] Layers and module boundaries respected; controllers have no business logic.
- [ ] The OpenAPI contract is updated first and the endpoint matches it.
- [ ] Mutating endpoints require `Idempotency-Key`; rate-limit policy applied.
- [ ] 401 for expired tokens, 403 for forbidden roles, 404 for foreign resources; an IDOR test exists.
- [ ] Errors use the standard shape with a British English `code`.

## Frontend

- [ ] Loading, empty and error states in every view; tables use server-side pagination, sorting and filters.
- [ ] Text only in i18n resources (Spanish), keys in British English; no amount calculations.
- [ ] Responsive on mobile; routes and menus follow the user role.

## Money and payments

- [ ] Amounts travel as decimal strings; half-even is used once per operation; allocations sum exactly.
- [ ] `VW_Reconciliation_Amounts` and `VW_Inventory_Reconciliation` return zero rows after the tests.
- [ ] Without Recurrente credentials only bank deposit is offered, in the UI and in the backend.

## Delivery checklist (Phase 1 and Phase 2)

- [ ] `docker compose up` from scratch works on Windows and Linux without manual steps.
- [ ] README (Spanish and British English) has installation, decisions, ER diagram, state diagrams, test credentials and the note that card payments need credentials or the simulator.
- [ ] Concurrency (stock and coupon), idempotency, IDOR and deposit tests are green.
- [ ] Lists and reports answer in under one second with the seed.
- [ ] Commit history is progressive; the last commit before the deadline is the one evaluated.
