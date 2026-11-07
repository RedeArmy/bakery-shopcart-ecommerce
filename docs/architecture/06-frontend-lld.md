# 06 · Frontend low-level design

| Aspect | Decision |
|---|---|
| Base | React 18, TypeScript, Vite |
| Routing | React Router v6 with `<ProtectedRoute roles>`; menus derive from the route configuration filtered by role |
| Server state | TanStack Query with homogeneous `loading`, `error` and `empty` states |
| API client | Types generated from `openapi.yaml` with `openapi-typescript` (`npm run api:generate`, committed, checked in CI by `npm run api:check`) and called through the typed `openapi-fetch` client in `src/shared/api/client.ts`. Amounts are shown with `Intl.NumberFormat` **from the string** and never operated on |
| Authentication | Access token in memory; refresh token in a `HttpOnly; SameSite=Strict` cookie ([ADR-0026](../adr/0026-refresh-token-in-an-httponly-cookie.md)); the session is restored by a renewal when the page loads; interceptor with **single-flight**: on a 401 only one renewal runs while the other requests wait and retry |
| Forms | react-hook-form with zod, messages per field. The schemas answer with i18n keys, so the Spanish text lives only in the resource files |
| Tables | Reusable `DataTable<T>` with server-side pagination, sorting and filters |
| Charts | Recharts: sales by period, by category, top 10 |
| UI states | `LoadingSkeleton`, `EmptyState`, `ErrorState` in every view; the error shows the Spanish text of the stable error `code` and never the English message |
| Look | Minimal and warm: `stone` neutrals, one berry accent, Fraunces for headings and Inter for text (both self-hosted through `@fontsource-variable`), 8 px radius, a 64 px header, one primary button per view, visible focus and `prefers-reduced-motion` respected. The tokens are in `src/index.css` |
| Sessions | A flag in `localStorage` (`shopcart.session`) tells the browser it had a session; only then does the page ask for a renewal when it opens. It is not a credential: it only saves the visitors without a session a call to `/auth/refresh`, which the edge limits to 10 a minute |
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

Catalogue, product detail (size and flavour), cart, checkout (guest or account, with the personalisation of each product for accounts), my orders and detail, login and register.

| Payment screen | Behaviour |
|---|---|
| Checkout, "Payment" step | Calls `GET /checkout/payment-methods?deliveryDate=`. With two methods it shows a selector (card first); with only deposit it shows it preselected. It generates the `Idempotency-Key` when the step opens and reuses it on retries. The button is disabled while the request is in flight. It handles 429 with `Retry-After` |
| Deposit instructions (`/orders/:number/payment`) | Bank account(s), **reference = order number**, exact amount, countdown to the deadline |
| Proof upload | Drag and drop with preview. Client-side type and size checks are only UX; the server decides. Fields: bank reference, date and deposited amount |
| Payment status | Badge `Pending`, `Under review`, `Approved`, `Rejected` (with the reason and an "Upload another proof" button while attempts remain), `Expired`. It refreshes with `refetchInterval` until the status is terminal |
| Card | Not built: no payment gateway is required, so the card selector and `/orders/:number/payment-result` do not exist |

### The checkout and the deposit payment

- **Steps.** `PurchaseSteps` (shared by accounts and guests once a guest has given the contact data): how the order is received, the address when it is a delivery, the bank account, the reservation and the confirmation. The personalisation (account) or the notice that it needs an account (guest) and the delivery address are collapsible sections (`Disclosure`: a button inside the heading with `aria-expanded` and `aria-controls`; the content stays mounted while it is collapsed, so what was typed is not lost).
- **Delivery or pickup, as a dropdown.** One `<select>` offers "Home delivery" and "Pick up at <branch>" for each active branch (`GET /branches`, public). A delivery shows the address section as before (the first address is preselected and a new one is added in place with `POST /addresses` and an `Idempotency-Key`); a pickup shows the branch with its address, phone and opening hours and asks for no address. If the chosen branch stops being offered, the choice goes back to the delivery.
- **The date is not chosen.** There is no calendar: the server defines it (`estimatedDeliveryDate` of `GET /checkout/payment-methods`, asked again whenever the cart signature changes) and the screen says it is an estimate that can move a few days either way. The deposit offer (`available`, `reason`, `deadlineAt`) comes from the same call. The client computes no date and no amount.
- **Reservation.** `POST /checkout/start` returns the expiry; a `Countdown` shows it and, at zero (or when the confirmation answers `RESERVATION_EXPIRED`), drops the reservation and asks to reserve again. Confirming sends `{idReservation, fulfilmentType, idAddress | idBranch, method: 'BANK_DEPOSIT', idBankAccount}` (no date) with a key kept across retries and renewed on success, then goes to `/orders/:id/payment` replacing the history entry so the back button does not return to a spent checkout.
- **Payment page.** Instructions (exact amount, reference = order number, account, deadline with countdown), the proof form (reference, date, amount prefilled from the order, file with a preview; type and size checks are only convenience) and the status. A rejected payment shows the reason and, while attempts remain, opens another attempt with the same bank account. For a guest session the recovery code panel is on the side. Another customer's order answers 404 and shows the not-found view.

### My orders

- **List.** `GET /orders` with `page`, `size` (10) and `status` (1 to 8, the order of the API statuses); the page and the status live in the address, so a link reproduces the view and the back button works. An empty list explains itself and offers the catalogue, with a different text when a filter is active.
- **Detail.** `GET /orders/{id}` (another customer's order answers 404 and shows the not-found view). Amounts are shown as they arrive; the discount line is hidden when it is zero. The history shows the status and the date, not the server `comment`, which is English technical text.
- **Cancel.** Offered for `PendingPayment`, `Paid` and `InPreparation`; the server decides if it is still possible and a paid order warns that a refund opens. It asks for a confirmation and an optional reason, and sends an `Idempotency-Key` kept across retries.
<!-- cspell:disable-next-line -->
- **Menu.** "Mis pedidos" is a navigation entry for the `Customer` role (guests included), from the same filtered configuration as the routes.

### The cart

- **Whose cart it is.** With a session the server identifies the cart by the access token. A visitor sends `X-Cart-Token`, a UUID the browser creates the first time the visitor adds something and keeps in `localStorage` (`shopcart.cartToken`); it is not a credential. A visitor who has added nothing has no token and the cart screen is empty without calling the server.
- **Merge at sign-in.** `useCartSync` (mounted in the layout) calls `POST /cart/merge` with the token when the session becomes authenticated, stores the returned cart, and forgets the token. If the merge fails the token stays and is tried again at the next sign in; the customer is never blocked. On sign out the cart of the account is removed from memory.
- **Personalisation is written at checkout, not on the product page.** The inscription lives in the cart line and is copied to the order line (`Inscription`, up to 60 characters; the order confirmation has no field for it, so it must be saved in the cart before the order is confirmed). The product page only asks for the quantity; `/checkout` shows one optional message field per product with a counter and a save button, which sends `PUT /cart/items/{variantId}` with the same quantity. Adding more units from the product page re-sends the inscription the line already had, because `PUT` replaces the line. There is no order-level note: the API and the tables only know the inscription per line, so a general comment would need a migration and a contract change.
- **Guests and made-to-order products.** A made-to-order product (`leadTimeDays` above 0) and the personalisation need an account: the product page shows why, with the way to sign in or register, instead of the add button; the checkout shows the personalisation locked for a guest. The database enforces the same rule (`ACCOUNT_REQUIRED`), so the screens only avoid offering what would fail.
- **From guest to account.** `useCartSync` remembers the products of a guest session; when that session ends in a sign in or a registration it passes them to the new account (not the coupon nor the personalisation). The sign in and register pages do not bounce a guest away: a guest has a session but no account.
- **Recovering the orders.** After giving a contact email a guest can generate a recovery code, shown once and grouped in two halves. `/recover` takes the email and the code and gives the guest session back on another device.
- **Operations return the whole cart.** Adding, changing a quantity, removing and the coupon replace the stored cart with the answer; there is no second request. Adding sets the quantity to what the cart already had plus what was chosen (the contract has `PUT`, not "add"), capped at 99; the server decides the stock (`INSUFFICIENT_STOCK`).
- **Coupons need a registered account** ([ADR-0027](../adr/0027-guest-accounts-for-checkout-without-registering.md)): a guest account is created without verifying anyone, so it could reuse coupons of one use per customer. A visitor or a guest sees in the summary why, with the way to sign in or register (what is in the cart goes with them), and can still buy at the full price. Each apply carries an `Idempotency-Key`. The cart query is keyed by the account, so the cart of a guest is never shown to the account that is created later.
- **Money.** Subtotal, discount, total and VAT are shown exactly as the database returns them; the client only checks whether the discount text is zero to hide an empty line.
- **Payment button.** A visitor goes to sign in and comes back to the cart; a line that is sold out or asks for more than what is left blocks it. It leads to `/checkout`, a route for customers (a visitor is sent to sign in, staff accounts see the forbidden view). `/checkout` is open to everyone and its steps depend on who arrives: a **visitor** chooses between buying as a guest and signing in; a **guest** gives the contact data (name, email, phone) and can generate a recovery code; an **account** personalises its products. The address, the delivery date and the deposit are the same for all and come in the next block.

## Administration screens

Dashboard, products, categories, inventory and ledger, coupons, orders, users, audit log, branches, and:

- **Branches (built).** `/admin/branches`, a route for the `Administrator` role with its menu entry. It lists every branch (the deactivated ones too, without actions) with the number of orders still waiting in each one; the active ones can be edited or removed. "Removing" asks for a confirmation and deactivates the branch (ADR-0028); the server refuses it while orders are waiting (`BRANCH_HAS_OPEN_ORDERS`) and the answer is shown. The form is the same for creating and editing, with the name unique among the active branches (`BRANCH_NAME_IN_USE`). It is also the first administration screen: the rest are still to be built.

- **Deposits to review:** table with server-side pagination, sorting and filters; columns order, customer, amount, reference, age. Visual alerts for a mismatching amount or an age over 24 h. A side panel shows the proof (image or PDF through an authenticated blob) with approve, or reject with a mandatory reason.
- **Refunds:** orphan payments and returns pending to refund.
- **Bank accounts.** The gateway status screen is not built.

## Tests

Vitest for model and helper logic. Playwright end-to-end in `tests/e2e`: buy with a deposit (upload, reject, re-upload, approve). Install the browser once with `npx playwright install chromium`, start the stack with `npm run up` and run `npm run test:e2e`; `E2E_BASE_URL` changes the address (default `http://localhost:8080`). The card scenario is dropped with the gateway. Today `tests/e2e` has 9 scenarios against the real stack: the home page, the catalogue (category, search, product and variants, a shared link, not-found views), the session (register, keep the session after a reload through the cookie, sign out, and anonymous visitors that do not ask for a renewal) and the purchase as a visitor (a made-to-order product is refused, a same day product is added, a coupon opens the guest session, the guest gives the contact data and generates a recovery code, and the personalisation is locked); the session scenario also covers the account (a made-to-order product, an expired coupon and the personalisation). The edge lets 10 calls a minute through to `/auth` (a burst of 5), the session scenario uses 4 and the guest purchase 1, so do not run the suite twice within the same minute. The deposit purchase scenario arrives with the checkout.

## Phase 2 scope and order

Fixed on 5 November, with four days left before Delivery Phase 2. The order protects the purchase flow first: if time runs out, cut from the bottom, and never ship half of a priority 1 flow. Every screen uses only operations that exist in the OpenAPI contract.

| Priority | Area | Screens | Operations |
|---|---|---|---|
| Done | Foundations | Typed client, forms with validation, charts and the end-to-end tool are installed and wired | `npm run api:generate`, `api:check`, `test:e2e` |
| 1 | Authentication and shell | Login, register, restore session, sign out, role guard, role menus, `LoadingSkeleton`, `EmptyState`, `ErrorState`, `DataTable` | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`; `GET /auth/me` |
| 1 | Catalogue | List with search and category filter; detail with its variants and available units | `GET /categories`, `/products`, `/products/{id}` |
| 1 | Cart and addresses (the cart is done; addresses arrive with the checkout) | Cart, quantity with the `INSUFFICIENT_STOCK` message, coupon, merge at sign-in, addresses | `GET /cart`; `PUT`, `DELETE /cart/items/{variantId}`; `POST`, `DELETE /cart/coupon`; `POST /cart/merge`; `GET`, `POST /addresses`; `PUT /addresses/{id}` |
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
