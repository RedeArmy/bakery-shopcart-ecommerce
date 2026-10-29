# ShopCart documentation

All documents are British English. The only Spanish files are the root `README.md` and the original inputs in `design/source/`. See [ADR-0024](adr/0024-language-and-spelling-conventions.md).

## Start here

| Document | Purpose |
|---|---|
| [progress/STATUS.md](progress/STATUS.md) | Where the project is right now |
| [progress/ROADMAP.md](progress/ROADMAP.md) | Every stage with owner, dates and acceptance |
| [glossary.md](glossary.md) | Spanish design terms ↔ British English code |
| [adr/README.md](adr/README.md) | The 24 architecture decision records |

## Architecture

| Document | Purpose |
|---|---|
| [01-system-overview](architecture/01-system-overview.md) | Context, requirements, scope levels, delivery phases |
| [02-hld](architecture/02-hld.md) | Components and the checkout, deposit and card sequences |
| [03-backend-lld](architecture/03-backend-lld.md) | Modules, ports and adapters, composition root, error mapping |
| [04-state-machines](architecture/04-state-machines.md) | Order and payment states and transitions |
| [05-security](architecture/05-security.md) | Authentication, authorisation, uploads, webhooks, secrets |
| [06-frontend-lld](architecture/06-frontend-lld.md) | Frontend structure, state, screens |
| [c4/](architecture/c4/context.md) | C4 context, containers and components (Mermaid) |

## Database

| Document | Purpose |
|---|---|
| [er-diagram](database/er-diagram.md) | Entity-relationship diagram and migration order |
| [naming-standard](database/naming-standard.md) | Naming rules for every object |
| [versioning](database/versioning.md) | Migrations, objects, seeds, runner, drift detection |
| [stored-procedure-catalogue](database/stored-procedure-catalogue.md) | Every procedure, view and function |
| [money-handling](database/money-handling.md) | Half-even policy, formulas, worked example |

## API, payments, quality, operations

| Document | Purpose |
|---|---|
| [api/conventions](api/conventions.md) | Errors, idempotency, pagination, money as strings |
| [api/openapi/openapi.yaml](api/openapi/openapi.yaml) | The contract (source of truth) |
| [payments/overview](payments/overview.md) | Payment methods and flows |
| [payments/bank-deposit](payments/bank-deposit.md) | Deposit flow, proofs, review |
| [payments/recurrente](payments/recurrente.md) | Card payments through Recurrente |
| [payments/availability-rule](payments/availability-rule.md) | When each method is offered |
| [quality/test-strategy](quality/test-strategy.md) | Test types and scenarios |
| [quality/sql-testing-tsqlt](quality/sql-testing-tsqlt.md) | tSQLt layers, rules and cases |
| [quality/definition-of-done](quality/definition-of-done.md) | When work counts as done |
| [quality/ci-pipeline](quality/ci-pipeline.md) | CI jobs and gates |
| [operations/runbook](operations/runbook.md) | Running, resetting and troubleshooting |
| [operations/environment-windows-linux](operations/environment-windows-linux.md) | Windows and Linux setup |
| [operations/configuration-reference](operations/configuration-reference.md) | Every environment variable |
| [operations/test-accounts](operations/test-accounts.md) | Test accounts and how their passwords are generated |
| [operations/branch-protection-and-sonarcloud](operations/branch-protection-and-sonarcloud.md) | Ruleset for `main` and SonarCloud setup |

## Original inputs (read-only)

- `design/source/DISENO_SHOPCART_v3.md`: consolidated design, in Spanish.
- `design/source/TechChallenge360-RetoShopCart-Enunciado.pdf`: the original brief.
