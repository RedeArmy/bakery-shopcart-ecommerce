# 06 · Frontend low-level design

| Aspect | Decision |
|---|---|
| Base | React 18, TypeScript, Vite |
| Routing | React Router v6 with `<ProtectedRoute roles>`; menus derive from the route configuration filtered by role |
| Server state | TanStack Query with homogeneous `loading`, `error` and `empty` states |
| API client | Types generated from `openapi.yaml` with `openapi-typescript` (`npm run api:generate`, committed, checked in CI by `npm run api:check`) and called through the typed `openapi-fetch` client in `src/shared/api/client.ts`. Amounts are shown with `Intl.NumberFormat` **from the string** and never operated on |
| Authentication | Access token in memory; refresh token in a `HttpOnly; SameSite=Strict` cookie ([ADR-0026](../adr/0026-refresh-token-in-an-httponly-cookie.md)); the session is restored by a renewal when the page loads; interceptor with **single-flight**: on a 401 only one renewal runs while the other requests wait and retry |
| Forms | react-hook-form with zod, messages per field |
| Tables | Reusable `DataTable<T>` with server-side pagination, sorting and filters |
| Charts | Recharts: sales by period, by category, top 10 |
| UI states | `LoadingSkeleton`, `EmptyState`, `ErrorState` in every view |
| Responsive | Mobile-first with Tailwind; tables collapse into cards |
| Language | Spanish (`es-GT`) in i18n resource files, British English keys, API `code` mapped to Spanish copy |
| Business logic | None. Components present; the API dictates amounts |

## Structure

```
frontend/src/
├─ app/        # providers, router, layout, error boundary
├─ features/   # catalogue, cart, checkout, orders, payments, account, admin
│  └─ <feature>/{api,components,hooks,model,pages}
├─ shared/{ui,lib/money,api/generated,config,i18n}
└─ main.tsx
```

## Customer screens

Catalogue, product detail (size, flavour, inscription), cart, checkout, my orders and detail, login and register.

| Payment screen | Behaviour |
|---|---|
| Checkout, "Payment" step | Calls `GET /checkout/payment-methods?deliveryDate=`. With two methods it shows a selector (card first); with only deposit it shows it preselected. It generates the `Idempotency-Key` when the step opens and reuses it on retries. The button is disabled while the request is in flight. It handles 429 with `Retry-After` |
| Deposit instructions (`/orders/:number/payment`) | Bank account(s), **reference = order number**, exact amount, countdown to the deadline |
| Proof upload | Drag and drop with preview. Client-side type and size checks are only UX; the server decides. Fields: bank reference, date and deposited amount |
| Payment status | Badge `Pending`, `Under review`, `Approved`, `Rejected` (with the reason and an "Upload another proof" button while attempts remain), `Expired`. It refreshes with `refetchInterval` until the status is terminal |
| Card | Not built: no payment gateway is required, so the card selector and `/orders/:number/payment-result` do not exist |

## Administration screens

Dashboard, products, categories, inventory and ledger, coupons, orders, users, audit log, and:

- **Deposits to review:** table with server-side pagination, sorting and filters; columns order, customer, amount, reference, age. Visual alerts for a mismatching amount or an age over 24 h. A side panel shows the proof (image or PDF through an authenticated blob) with approve, or reject with a mandatory reason.
- **Refunds:** orphan payments and returns pending to refund.
- **Bank accounts.** The gateway status screen is not built.

## Tests

Vitest for model and helper logic. Playwright end-to-end in `tests/e2e`: buy with a deposit (upload, reject, re-upload, approve). Install the browser once with `npx playwright install chromium`, start the stack with `npm run up` and run `npm run test:e2e`; `E2E_BASE_URL` changes the address (default `http://localhost:8080`). The card scenario is dropped with the gateway.

## Phase 2 scope and order

Fixed on 5 November, with four days left before Delivery Phase 2. The order protects the purchase flow first: if time runs out, cut from the bottom, and never ship half of a priority 1 flow. Every screen uses only operations that exist in the OpenAPI contract.

| Priority | Area | Screens | Operations |
|---|---|---|---|
| Done | Foundations | Typed client, forms with validation, charts and the end-to-end tool are installed and wired | `npm run api:generate`, `api:check`, `test:e2e` |
| 1 | Authentication and shell | Login, register, restore session, sign out, role guard, role menus, `LoadingSkeleton`, `EmptyState`, `ErrorState`, `DataTable` | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`; `GET /auth/me` |
| 1 | Catalogue | List with search and category filter; detail with its variants and available units | `GET /categories`, `/products`, `/products/{id}` |
| 1 | Cart and addresses | Cart, quantity with the `INSUFFICIENT_STOCK` message, coupon, merge at sign-in, addresses | `GET /cart`; `PUT`, `DELETE /cart/items/{variantId}`; `POST`, `DELETE /cart/coupon`; `POST /cart/merge`; `GET`, `POST /addresses`; `PUT /addresses/{id}` |
| 1 | Checkout and deposit | Payment step, reservation countdown, confirm with `Idempotency-Key`, deposit instructions, proof upload, new attempt, payment status | `GET /checkout/payment-methods`; `POST /checkout/start`, `/checkout/confirm`; `GET /orders/{id}/payment`; `POST /orders/{id}/payment/attempts`, `/payment/proofs`; `GET /orders/{id}/payment/proofs/{proofId}` |
| 1 | My orders | List, detail with history, cancel | `GET /orders`, `/orders/{id}`; `POST /orders/{id}/cancel` |
| 2 | Deposit review queue | Table with server-side filters, proof panel, approve, reject with reason, bank accounts | `GET /admin/payments/deposits`; `GET /admin/payments/{id}/proofs/{proofId}`; `POST /admin/payments/{id}/approve`, `/reject`; `GET`, `POST /admin/bank-accounts`; `PUT /admin/bank-accounts/{id}` |
| 2 | Staff orders | List, detail, change status, register a return | `GET /admin/orders`, `/admin/orders/{id}`, `/admin/orders/{id}/payment`; `PATCH /admin/orders/{id}/status`; `POST /admin/orders/{id}/returns` |
| 2 | Dashboard | Summary, sales by period, by category, top products, abandoned carts | `GET /admin/dashboard/summary`, `/sales`, `/sales-by-category`, `/top-products`, `/abandoned-carts` |
| 3 | Catalogue administration | Categories, products, variants and prices | `/admin/categories`, `/admin/products`, `/admin/variants` |
| 3 | Inventory | Ledger, entries, adjustments with a mandatory reason | `GET /admin/inventory/ledger`; `POST /admin/inventory/entries`, `/adjustments` |
| 3 | Coupons, users, audit log, refunds | One table each, with create and edit where the API allows | `/admin/coupons`, `/admin/users`, `/admin/audit-log`, `/admin/refunds` |

Not built: the card selector and its result page, the gateway status screen and the switch of payment method. The system screens (`/admin/system/*`) and the health probes are not part of the interface.

Each screen is done when it has its loading, empty and error states, its Spanish copy in the i18n files, a mobile layout and a test of its logic. The deposit purchase also has the end-to-end scenario.
