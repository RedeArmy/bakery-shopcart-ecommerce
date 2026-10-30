# API conventions

The contract is [`openapi/openapi.yaml`](openapi/openapi.yaml) and it is written first ([ADR-0011](../adr/0011-contract-first-openapi.md)). Requests and responses are validated against it at runtime, Schemathesis exercises it in CI, and the frontend client is generated from it with `openapi-typescript`.

## Basics

- Base path `/api/v1`; plural kebab-case resources (`/api/v1/orders`, `/api/v1/checkout/confirm`).
- JSON fields are `camelCase`; timestamps are ISO-8601 UTC.
- Business messages are never user-facing Spanish copy: the frontend maps `error.code` to Spanish text.

## Money as strings

Amounts are never JSON numbers. They use the `Money` schema: `{ "amount": "145.00", "currency": "GTQ" }`, pattern `^\d{1,16}\.\d{2}$` ([ADR-0020](../adr/0020-amounts-as-decimal-strings-in-the-api.md)). Clients send identifiers, not amounts: the database calculates every total.

## Error format

```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "One or more units are no longer available", "details": null, "requestId": "7c1e…" } }
```

HTTP codes: 400 validation or missing key, 401 missing or expired token, 403 insufficient role, 404 missing or not yours, 409 conflict (inventory, coupon, request in progress, reference already used), 413 file too large, 415 file type not allowed, 422 business rule or reused key, 429 rate limit, 502 gateway.

### Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | A request failed schema validation (`details` lists the issues) |
| `INVALID_JSON` | 400 | Malformed JSON body |
| `UNAUTHENTICATED` | 401 | The request has no access token |
| `TOKEN_INVALID` | 401 | The access token is invalid or expired |
| `FORBIDDEN` | 403 | The role is not allowed to do this |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password (the same answer for an unknown email) |
| `ACCOUNT_LOCKED` | 423 | Too many failed attempts; `details.lockedUntil` says until when |
| `ACCOUNT_DISABLED` | 403 | The account was deactivated |
| `EMAIL_ALREADY_REGISTERED` | 409 | The email already has an account |
| `REFRESH_TOKEN_INVALID` | 401 | The refresh token is unknown, expired or its account is inactive |
| `REFRESH_TOKEN_REUSED` | 401 | A rotated refresh token was presented again; its whole family is revoked |
| `IDEMPOTENCY_KEY_INVALID` | 400 | The key does not have 8 to 64 letters, digits, hyphens or underscores |
| `IDEMPOTENCY_SCOPE_MISSING` | 400 | An idempotent request without a session or a guest cart token |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | A mutating endpoint was called without `Idempotency-Key` |
| `INVALID_AMOUNT` | 400 | Amount does not match `^\d{1,16}\.\d{2}$` |
| `NOT_FOUND` | 404 | Does not exist, or belongs to someone else |
| `ROUTE_NOT_FOUND` | 404 | Unknown route |
| `INSUFFICIENT_STOCK` | 409 | One or more units are no longer available |
| `COUPON_EXHAUSTED` | 409 | Usage limit reached |
| `RESERVATION_EXPIRED` | 409 | The 15-minute reservation elapsed |
| `REQUEST_IN_PROGRESS` | 409 | Same idempotency key still being processed (`Retry-After`) |
| `REFERENCE_ALREADY_USED` | 409 | The bank reference backs another live payment |
| `PAYMENT_METHOD_UNAVAILABLE` | 422 | The method is not offered (for example `CARD` without credentials) |
| `DEPOSIT_UNAVAILABLE_FOR_DATE` | 422 | Fewer than `MinDepositHours` remain before delivery |
| `PAYMENT_PROOF_REUSED` | 422 | The file hash is already in another payment |
| `AMOUNT_MISMATCH` | 422 | The received amount differs from the order total |
| `COUPON_EXPIRED` | 422 | The coupon is outside its validity dates |
| `COUPON_MINIMUM_NOT_MET` | 422 | The cart is below the coupon minimum |
| `COUPON_NOT_FOUND` | 404 | The code does not exist |
| `COUPON_INACTIVE` | 422 | The coupon was withdrawn |
| `COUPON_NOT_STARTED` | 422 | The coupon is not valid yet |
| `COUPON_ALREADY_USED` | 422 | The customer already used the coupon the allowed number of times |
| `COUPON_NOT_APPLICABLE` | 422 | No item of the cart is covered by the coupon |
| `INVALID_STATE_TRANSITION` | 422 | The order or payment transition is not allowed |
| `RETURN_QUANTITY_EXCEEDED` | 422 | More units than were sold on the line |
| `IDEMPOTENCY_KEY_REUSED` | 422 | The key was used with a different body |
| `IDEMPOTENCY_KEY_IN_USE` | 409 | The key was already used to create another order |
| `DELIVERY_DATE_TOO_SOON` | 422 | The delivery date is earlier than the lead time of the products allows |
| `DEPOSIT_ATTEMPTS_EXCEEDED` | 422 | The order used all its deposit attempts |
| `PAYLOAD_TOO_LARGE` | 413 | File over 5 MB |
| `UNSUPPORTED_FILE_TYPE` | 415 | Magic bytes are not JPEG, PNG or PDF |
| `RATE_LIMITED` | 429 | Too many requests |
| `GATEWAY_ERROR` | 502 | The card gateway failed |
| `WEBHOOK_EXPIRED` | 400 | Webhook timestamp outside the tolerance |
| `WEBHOOK_SIGNATURE_INVALID` | 401 | Svix signature does not verify |
| `INTERNAL_ERROR` | 500 | Unexpected failure (only logged with the request id) |

Stored procedures raise `THROW` codes 50400, 50404, 50409 and 50422, which the executor maps to 400, 404, 409 and 422. The Spanish names in the design map to these codes in the [glossary](../glossary.md).

## Idempotency

| Operation | Rule |
|---|---|
| `POST`/`PATCH` that mutate state, money or inventory (checkout confirm, orders, returns, adjustments and entries, coupons, status change, **proof upload, approve, reject**, register) | `Idempotency-Key` **required**; without it, 400 |
| `PUT`/`DELETE` | Optional (idempotent by semantics); honoured if present |
| Cart | No key: **absolute quantities** (`PUT /cart/items/{variantId}`) |
| `POST /orders/{id}/payment/verify` (Phase 2) | No key: idempotent by design |
| `POST /webhooks/recurrente` (Phase 2) | `svix-id` with `UNIQUE (Provider, MessageID)` |
| `/auth/login`, `/auth/refresh`, `/auth/logout` | Excluded: refresh uses rotation and reuse detection; login uses rate limiting and lockout |

How it works: the key scope is `(Scope, Method, Route, Key)`. Before the use case, `SP_Idempotency_Begin` inserts atomically against a unique key.

| Outcome | Response |
|---|---|
| New key | Runs the operation |
| Already completed | The **same stored response** with `Idempotent-Replayed: true` |
| In progress | 409 with `Retry-After` |
| Same key, different body hash | 422 |

2xx and deterministic 4xx are stored; **5xx are not**, so they can be retried. A request in progress for over 60 s is considered abandoned. Keys expire after 24 h and a job purges them. For multipart proofs, the hash covers the text fields plus the file SHA-256.

## Pagination, sorting and filtering

Server-side only: `page` (from 1), `size` (default 20, maximum 100), `sort` (`field` or `-field`). Lists return `{ items, page, size, total }`. `OFFSET … FETCH` with a deterministic `ORDER BY` in the procedure.

## Rate limiting

Responses answer **429** with the standard error, `Retry-After` and `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`. The key is the `IDUser` when authenticated, else the IP. `/health/*` is exempt.

| Group | Key | Limit |
|---|---|---|
| Global | IP | 300 / min |
| `login`, `register` | IP + email | 5 / min and progressive lockout |
| `refresh` | IP | 20 / min |
| Public catalogue | IP | 120 / min |
| `GET /checkout/payment-methods` | IP | 120 / min |
| Guest cart | Guest token | 30 / min |
| Authenticated writes | IDUser | 60 / min |
| `checkout/confirm` | IDUser | 5 / min |
| Proof upload | IDUser | 5 / min |
| Proof download | IDUser | 30 / min |
| `approve`, `reject` | IDUser | 60 / min |
| `POST /webhooks/recurrente` (Phase 2) | IP | 120 / min (authenticity comes from the signature) |
| `POST …/payment/verify` (Phase 2) | IDUser | 10 / min |
| Dashboard and audit log | IDUser | 30 / min |

## Route index

| Method and route | Role | Phase | Notes |
|---|---|---|---|
| `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` | Public | 1 | Rate limited; refresh rotates |
| `GET /categories`, `GET /products?q=&category=&min=&max=&available=&sort=&page=&size=`, `GET /products/{id}` | Public | 1 | Server-side pagination |
| `POST/PUT/DELETE /admin/categories`, `/admin/products`, `/admin/variants` | Administrator | 1 | `DELETE` deactivates when sales exist |
| `PATCH /admin/variants/{id}/price` | Administrator | 1 | Idempotency-Key; audited |
| `GET /admin/inventory/ledger?variant=`, `POST /admin/inventory/entries`, `POST /admin/inventory/adjustments` | Operator, Administrator | 1 | Reason required; Idempotency-Key |
| `GET /cart`, `PUT /cart/items/{variantId}`, `DELETE /cart/items/{variantId}` | Public (guest token) or Customer | 1 | Absolute quantity; `X-Cart-Token` for guests |
| `POST /cart/coupon`, `DELETE /cart/coupon` | Customer | 1 | One coupon per order |
| `GET/POST/PUT /addresses` | Customer | 1 | Own addresses only |
| `GET /checkout/payment-methods?deliveryDate=` | Customer | 1 | Only what is available |
| `POST /checkout/start` | Customer | 1 | 15-minute reservation |
| `POST /checkout/confirm` | Customer | 1 | **Idempotency-Key required.** Creates the `PendingPayment` order; returns bank details and deadline, or `checkoutUrl` (card, Phase 2) |
| `GET /orders`, `GET /orders/{id}` | Customer | 1 | Always filtered by the token's `IDUser` |
| `GET /orders/{id}/payment` | Customer | 1 | Status, attempts, rejection reason, deadline |
| `POST /orders/{id}/payment/proofs` | Customer | 1 | `multipart/form-data`: `referenceNumber`, `depositDate`, `depositedAmount`, `file`. Idempotency-Key |
| `GET /orders/{id}/payment/proofs/{proofId}` | Customer | 1 | Authenticated download |
| `POST /orders/{id}/cancel` | Customer, Operator | 1 | Idempotency-Key |
| `POST /orders/{id}/payment/verify` | Customer | 2 | Reconciles with Recurrente after returning |
| `POST /orders/{id}/payment/card`, `POST /orders/{id}/payment/deposit` | Customer | 2 | Switch method |
| `POST /webhooks/recurrente` | Public (Svix signature) | 2 | No JWT or Idempotency-Key (uses `svix-id`) |
| `GET /admin/orders?status=&customer=&from=&to=&page=` | Operator, Administrator | 1 | |
| `PATCH /admin/orders/{id}/status`, `POST /admin/orders/{id}/returns` | Operator, Administrator | 1 | Idempotency-Key |
| `GET /admin/payments/deposits?status=&from=&to=&page=` | Operator, Administrator | 1 | Review queue, server-side pagination |
| `GET /admin/payments/{id}/proofs/{proofId}` | Operator, Administrator | 1 | Download |
| `POST /admin/payments/{id}/approve`, `POST /admin/payments/{id}/reject` | Operator, Administrator | 1 | `reject` requires `{ reason }`. Idempotency-Key |
| `GET/POST/PUT/DELETE /admin/coupons` | Administrator | 1 | |
| `GET /admin/dashboard/sales?granularity=day\|week\|month`, `/sales-by-category`, `/top-products`, `/abandoned-carts` | Administrator | 1 | By `PaidAt` |
| `GET /admin/audit-log?module=&page=` | Administrator | 1 | |
| `GET/PATCH /admin/users` | Administrator | 1 | Activate or deactivate |
| `GET/PUT /admin/bank-accounts` | Administrator | 1 | The seed provides them; CRUD may be Level 3 |
| `GET /admin/refunds?status=Pending`, `PATCH /admin/refunds/{id}` | Administrator | 1 | Orphan payments and returns to refund |
| `GET /admin/payments/gateway-status` | Administrator | 2 | Configured or not, mode, last probe. **No keys** |
| `GET /admin/system/version` | Administrator | 1 | App, schema and procedure versions |
| `GET /health/live`, `/health/ready` | Public | 1 | `ready` checks the database and schema version |
