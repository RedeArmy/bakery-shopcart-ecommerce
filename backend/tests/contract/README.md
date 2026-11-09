# Backend contract tests

**Responsibility:** Nothing lives here by itself. The contract is checked by `backend/tests/support/contract.ts` (an Ajv validator of a response against `openapi.yaml`) and by the last case of `backend/tests/integration/api.test.ts`, which validates every JSON response that the whole integration suite recorded. The checker is tested by `backend/tests/unit/contract-validator.test.ts`.

**Why not Schemathesis:** the integration suite already drives the real flows with real data (an order cannot be paid before it is created), and checking those responses finds the deviations that matter. Fuzzing every operation would need the same set-up again.

**Governing ADR:** [0011](../../../docs/adr/0011-contract-first-openapi.md)
