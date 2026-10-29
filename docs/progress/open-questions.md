# Open questions

| # | Question or assumption | Status | Notes |
|---|---|---|---|
| 1 | Shop UI copy and seed catalogue content are Spanish (`es-GT`); code, database and documents are British English | Open | Confirm with the engineer |
| 2 | Documents (ADRs, `docs/`, CONTRIBUTING, folder READMEs) are British English only. The root README is bilingual by decision: Spanish main (`README.md`) and British English (`README.en.md`) | Open | |
| 3 | The brief may require Spanish names for some objects | Open, **checked** | The brief fixes only the prefixes and patterns (`SP_Module_Process`, `VW_`, `FU_`, `ID<Name>`); its Spanish object names are labelled as examples for this project, not mandates. We proceeded in British English. If the evaluator says the examples are binding, only `docs/glossary.md` needs to drive a rename |
| 4 | Is it valid to create orders as `PendingPayment` before the payment is confirmed? | Resolved | The evaluator answered affirmatively (recorded on 2026-10-29). See [ADR-0014](../adr/0014-order-created-as-pending-payment.md) and the question in [payments overview](../payments/overview.md#industry-validation) |
| 5 | Recurrente details still unverified: `expires_at` on checkout creation, refund payload, `PUT` on checkouts, reuse of a failed payment intent | Open | Validate with test keys on the first day of Stage 8 |
| 6 | tSQLt needs CLR: confirm it installs on the Linux SQL Server image and on Docker Desktop (WSL2) | Open | Stage 2 spike; plan B is Vitest-based SQL tests with identical assertions |
| 7 | If electronic invoicing (FEL) is ever added, re-check the fiscal rounding rule against half-even | Open | |
| 8 | The design names coupons `BIENVENIDO10` and `PASTELES25`; the prompt names them `WELCOME10` and `CAKES25` | Open | The prompt wins for naming; the codes are seed data and can be translated in the seed <!-- spelling-ignore --> |
| 9 | The design's audit table uses Spanish action values (create, modify, deactivate, status change) | Open | Mapped to `AuditLog` with `Create`, `Update`, `Deactivate`, `StatusChange`; confirm the values in Stage 2 |
| 10 | Design repository layout puts the OpenAPI at `docs/openapi/openapi.yaml`; this project uses `docs/api/openapi/openapi.yaml` | Resolved | The prompt's layout wins |
| 11 | `docker compose up` could not be run during Stages 0 and 1 because the Docker daemon was not running | Resolved | Run on 29 Oct: all services healthy; fixed IPv6 `localhost` in health checks |
