# Database naming standard

The prefixes `SP_`, `VW_`, `FU_` and `ID` come from the challenge brief and are kept. Everything after them is British English (ADR-0024). Names use the first letter of every word in capitals.

| Object | Pattern | Example |
|---|---|---|
| Table | Plural `PascalCase` | `Orders`, `OrderLines`, `PaymentProofs` |
| Primary and foreign key column | `ID<Entity>` (singular) | `IDOrder`, `IDProduct`, `IDUser` |
| Stored procedure | `SP_<Module>_<Process>` | `SP_Orders_CreateOrder`, `SP_Payments_ConfirmPayment` |
| View | `VW_<Module>_<Name>` | `VW_Reconciliation_Amounts` |
| Function (always table-valued, inline when possible) | `FU_<Module>_<Name>` | `FU_Money_HalfEvenDivision` |
| Trigger | `TR_<Table>_<Purpose>` | `TR_Orders_AmountsImmutable` |
| Constraints and indexes | `PK_`, `FK_`, `UQ_`, `UX_` (unique index), `CK_`, `DF_`, `IX_` + table + column(s) | `UX_Payments_OneApproved` |
| Boolean columns | `Is…` / `Has…` | `IsActive` |
| Timestamps | `…At`, `DATETIME2(3)` in UTC. Business-day logic converts explicitly to `Central America Standard Time` | `CreatedAt` |

## Rules

- A scalar function is written as an inline table-valued function (`FU_`), for example `FU_Money_HalfEvenDivision` returns a one-row table with `Result`.
- The foreign key column keeps the name of the primary key it references (`Orders.IDUser` references `Users.IDUser`).
- Money is `DECIMAL(18,2)`; quantities are `INT`; there is never `FLOAT`, `REAL`, `MONEY` or `SMALLMONEY`.
- No `_v2` suffixes: an incompatible change uses a new process name with expand/contract ([versioning](versioning.md)).
- Reference-table identifiers are small integers with fixed meaning (for example `OrderStatuses` 1 to 8).
- Comments in SQL are Spanish and explain the why.

## Collation and temporary tables

The database collation is `Latin1_General_100_CI_AS_SC` ([ADR-0025](../adr/0025-database-collation.md)): case insensitive, accent sensitive, aware of supplementary characters. The runner creates the database with it and refuses any other.

- A temporary table takes the collation of `tempdb`, not of the database. Declare every text column of a `#temp` table with `COLLATE DATABASE_DEFAULT`, so that comparing it with a table of the database never raises a collation conflict, whatever the server uses. Table variables follow the database and need nothing.
- To search without accents, add `COLLATE Latin1_General_100_CI_AI_SC` to the comparison in the procedure; never change the column.
- Do not put a `COLLATE` on a column of a migration: the whole database uses one collation.

## File names

| Type | Pattern | Example |
|---|---|---|
| Migration | `V####__descriptor.sql` | `V0001__create_core_tables.sql` |
| Programmable object | `R####__<ObjectName>.sql` | `R0101__SP_Orders_CreateOrder.sql` |
| Seed | `S####__descriptor.sql` | `S0001__seed_roles.sql` |

The descriptor is `snake_case`. `npm run sql:lint` checks the patterns now; Stage 2 adds object naming, version headers and forbidden types.
