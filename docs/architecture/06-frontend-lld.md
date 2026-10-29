# 06 · Frontend low-level design

| Aspect | Decision |
|---|---|
| Base | React 18, TypeScript, Vite |
| Routing | React Router v6 with `<ProtectedRoute roles>`; menus derive from the route configuration filtered by role |
| Server state | TanStack Query with homogeneous `loading`, `error` and `empty` states |
| API client | Generated from `openapi.yaml`; types shared with the backend. Amounts are shown with `Intl.NumberFormat` **from the string** and never operated on |
| Authentication | Access token in memory; refresh token in a `HttpOnly; SameSite=Strict` cookie; interceptor with **single-flight**: on a 401 only one renewal runs while the other requests wait and retry |
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
| Card (Phase 2) | Redirects to `checkoutUrl`; no card data is handled. `/orders/:number/payment-result` calls `…/payment/verify` and polls every 3 s for up to 60 s |

## Administration screens

Dashboard, products, categories, inventory and ledger, coupons, orders, users, audit log, and:

- **Deposits to review:** table with server-side pagination, sorting and filters; columns order, customer, amount, reference, age. Visual alerts for a mismatching amount or an age over 24 h. A side panel shows the proof (image or PDF through an authenticated blob) with approve, or reject with a mandatory reason.
- **Refunds:** orphan payments and returns pending to refund.
- **Bank accounts** and **Gateway** (Recurrente status, Phase 2).

## Tests

Vitest for model and helper logic, Playwright end-to-end in Delivery Phase 2: buy with a deposit (upload, reject, re-upload, approve) and, with the simulator, buy with a card.
