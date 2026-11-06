# Frontend: generated client

**Responsibility:** Output of `npm run api:generate`: the types of every path of `docs/api/openapi/openapi.yaml`. The typed client that uses them is `../client.ts`.

**May contain:** Generated files only.

**Must not contain:** Manual edits. `npm run api:check` regenerates the file and fails if it differs from the committed one.

**Governing ADR:** [0011](../../../../../docs/adr/0011-contract-first-openapi.md)
