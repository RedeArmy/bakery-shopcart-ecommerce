# Test accounts

The challenge brief asks for test credentials in the README, and the project rule is that **no password and no password hash is ever stored in the repository**. Both are met by publishing the accounts (the e-mail addresses are not secrets) and generating the passwords on each machine.

## Accounts

| Role | E-mail | Purpose |
|---|---|---|
| Administrator | `admin@shopcart.test` | Catalogue, prices, coupons, users, reports and the audit log |
| Operator | `operator@shopcart.test` | Orders, inventory and the deposit review queue |
| Customer | `customer1@shopcart.test` | Buys, uploads proofs and follows orders |
| Customer | `customer2@shopcart.test` | A second customer, to check that one customer never sees another's data (IDOR) |

- The domain `.test` is reserved by RFC 2606, so these addresses can never reach a real mailbox.
- Names are Spanish seed data (for example "Cliente Uno"); the e-mail addresses and roles are British English. <!-- spelling-ignore -->
- The performance seed adds synthetic customers (`load0001@shopcart.test` and so on). They are not documented, they share the customer password and they exist only to give the reports realistic volume.

## Passwords

| Variable | Used for | Where it lives |
|---|---|---|
| `SEED_ADMIN_PASSWORD` | The administrator | The local `.env` file only |
| `SEED_OPERATOR_PASSWORD` | The operator | The local `.env` file only |
| `SEED_CUSTOMER_PASSWORD` | Both customers and the synthetic customers | The local `.env` file only |

1. `npm run up` creates `.env` when it is missing and fills these variables with random values, using the same mechanism that already generates the database and JWT secrets. The values contain letters and digits only, so they survive the shell and `sqlcmd` without escaping.
2. `.env` is ignored by Git and `.env.example` keeps these variables empty.
3. To read a password, open your local `.env`.
4. To rotate all of them, stop the stack with `docker compose down --volumes`, delete `.env` and run `npm run up` again. The volumes must go too, because the seed does not overwrite an account that already exists.

## How the accounts are created

- The roles (Customer, Operator, Administrator) are reference data in an idempotent SQL seed (`S####`). No SQL seed contains a user, a password or a hash.
- Users come from a seed step in Node that runs after the SQL seeds. It hashes each password with argon2id and calls `SP_Users_Register` through the single stored-procedure executor, so the hash only ever exists in the database. If the e-mail already exists it does nothing, which keeps the step idempotent.
- The step runs only when `SEED_DEMO_DATA` is `true`. The local `.env` sets it to `true` and a production environment must never set it.
- The accounts follow the normal rules: the account lockout and the rate limits apply to them like to any other user.

## What the README says

Both READMEs list the e-mail addresses and point to `.env` for the passwords, so an evaluator who follows only the README (`npm run up`) can sign in without any password written in the repository.

The implementation lands in Stage 2: the runner and the seed step, and the three variables in `ensure-env`, `.env.example` and the [configuration reference](configuration-reference.md).
