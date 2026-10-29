# 05 · Security

## Authentication and sessions

- Passwords are hashed with **argon2id** (`@node-rs/argon2`; fallback `bcryptjs`).
- The access token is a JWT valid for 15 minutes. The refresh token is opaque, valid for 7 days, stored only as a **SHA-256 hash**, rotated on every use, and reuse detection revokes the whole family (`FamilyId`).
- Account lockout: `FailedAttempts` and `LockedUntil` live in the database so it works across replicas.
- Users are deactivated, never deleted (`IsActive`).

## Authorisation and tenant isolation

- Roles: Customer, Operator, Administrator. Role checks run in middleware and ownership checks run **inside the stored procedure**.
- The `IDUser` always comes from the verified token, never from the body, query or URL.
- A resource that belongs to another customer answers **404**, including payment proofs, so existence is not leaked. 401 means a missing or expired token; 403 means an insufficient role.
- IDOR tests: customer A requests an order, cart, address or proof of customer B and must never get 200.

## Transport and headers

Helmet, CORS with an allow-list, body size limits, layered rate limiting ([ADR-0010](../adr/0010-layered-rate-limiting.md)), account lockout. `trust proxy` is set only for nginx so `X-Forwarded-For` cannot be forged. nginx adds `nosniff`, `X-Frame-Options` and `Referrer-Policy`.

## Input validation and SQL injection

Every boundary validates with zod. Procedures are called with typed parameters only; nothing is concatenated into SQL, in the backend or inside procedures. If a procedure needs dynamic SQL it uses `sp_executesql` with parameters. The application login has `EXECUTE` only and `DENY SELECT, INSERT, UPDATE, DELETE`.

## Secrets

Secrets live only in environment variables. `.env.example` has no real values and `gitleaks` runs in CI. The Recurrente keys never appear in logs or responses; pino redacts `X-SECRET-KEY`, `X-PUBLIC-KEY`, `svix-signature`, tokens and passwords.

## Payment proof uploads

| Control | Implementation |
|---|---|
| Size | `multer` limit of `PAYMENT_PROOF_MAX_BYTES` (5 MB), one file; 413 when exceeded |
| Real type | First bytes: JPEG `FF D8 FF`, PNG `89 50 4E 47`, PDF `25 50 44 46`. The client content type is not trusted; 415 otherwise |
| Name | The storage key is a UUID. The original name is only metadata and is sanitised when shown |
| Location | Private named volume outside any static directory, owned by a non-root user |
| Reuse | SHA-256 of the file and a unique live bank reference |
| Download | Only through the authenticated API: the order owner or an Operator/Administrator. Others get 404 |
| Download headers | Stored `Content-Type`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, `Content-Security-Policy: sandbox`, sanitised `Content-Disposition` |
| Compensation | If the database fails after saving, the file is deleted; a job removes files without a row |

## Webhooks (Delivery Phase 2)

The route is mounted before `express.json()` so the raw body is available. The Svix signature (HMAC-SHA256 over `id.timestamp.body`) is checked in constant time, accepting several signatures in the header, with a five-minute tolerance against replay. Messages are deduplicated by `svix-id` with a unique key. Authenticity comes from the signature, so the endpoint needs no JWT or idempotency key.

## Rate limiting

See [ADR-0010](../adr/0010-layered-rate-limiting.md) and the policy table in [API conventions](../api/conventions.md#rate-limiting).

## Container hardening

Multi-stage images, non-root users, `.dockerignore`, pinned image versions, `HEALTHCHECK`, graceful shutdown on `SIGTERM`.
