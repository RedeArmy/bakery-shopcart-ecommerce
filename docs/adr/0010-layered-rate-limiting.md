# ADR-0010: Layered rate limiting

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Authentication endpoints are brute-force targets and checkout endpoints must resist abuse, while two API replicas may run behind nginx.

## Decision

Three layers: nginx `limit_req` as a coarse per-IP cap that is uniform across replicas; Express policies behind a `RateLimitStore` port (in-memory by default, Redis adapter optional) keyed by user or IP per route group; and account lockout stored in the database (`FailedAttempts`, `LockedUntil`). 429 responses use the standard error shape with `Retry-After` and `RateLimit-*` headers. `trust proxy` is configured only for nginx. `/auth/*` is implemented first.

## Consequences

- With in-memory stores and two replicas the effective limit doubles; nginx and the database lockout compensate.
- Each 429 is counted in a metric and logged with the request id.

## Alternatives considered

- A single in-memory layer: weak with several replicas.
- Redis from day one: extra infrastructure before it is needed.

## Links

- [Design v3 §10](../design/source/DISENO_SHOPCART_v3.md)
