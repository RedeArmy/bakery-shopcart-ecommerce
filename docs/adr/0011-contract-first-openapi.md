# ADR-0011: Contract-first OpenAPI

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The frontend and backend are built by one person under time pressure, and the brief asks for API documentation. Drift between code and documentation is a common source of defects.

## Decision

`docs/api/openapi/openapi.yaml` is the source of truth. Requests and responses are validated against it at runtime, Schemathesis exercises it in CI, and the frontend client is generated with `openapi-typescript`. The API lives under `/api/v1`, amounts use the `Money` schema (decimal string plus currency), and the contract is served as Swagger.

## Consequences

- Changing an endpoint starts with the contract.
- The generated client and the backend types cannot silently diverge.

## Alternatives considered

- Code-first generation: the documentation follows the code and drifts.

## Links

- [Design v3 §11](../design/source/DISENO_SHOPCART_v3.md)
