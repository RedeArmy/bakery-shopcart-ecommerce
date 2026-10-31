# Postman verification collection

A collection that checks the delivery end to end against the running stack: **44 requests and 76 assertions**. It proves authentication first, which is the gate of Phase 1, and then the rules of the other modules through the API.

| File | What it is |
|---|---|
| `ShopCart.postman_collection.json` | The requests, with their assertions, in the order to run them |
| `ShopCart.local.postman_environment.json` | The variables for the local stack: server address, test accounts and two empty password slots |

Both files are versioned and contain no password or token. A test (`backend/tests/unit/postman.test.ts`) fails if a request asks for an operation that the [OpenAPI contract](../openapi/openapi.yaml) does not have, if a request has no assertion, or if a password is written in either file.

## Before you start

1. Start the stack: `npm run up`. The API answers at `http://localhost:8080/api/v1`.
2. Open the `.env` file that `npm run up` created in the root of the repository and copy two values: `SEED_ADMIN_PASSWORD` and `SEED_CUSTOMER_PASSWORD`. They are generated at random on each machine; the accounts are in the [test accounts guide](../../operations/test-accounts.md).

## Run it in Postman

1. **Import** both files (Import, then drop them in).
2. Select the environment **ShopCart · local** and paste the two passwords in the **Current value** column of `adminPassword` and `customerPassword`.
3. Open the collection, choose **Run**, keep the folder order and press **Run ShopCart**.

Every run creates its own customer, category, product, coupons and order, so it can be repeated. **Wait one minute between runs**: sign-in and registration are limited to five attempts per minute, and the collection uses exactly five.

## Run it from a terminal

```bash
npx newman run docs/api/postman/ShopCart.postman_collection.json -e docs/api/postman/ShopCart.local.postman_environment.json --env-var "adminPassword=<SEED_ADMIN_PASSWORD>" --env-var "customerPassword=<SEED_CUSTOMER_PASSWORD>"
```

Expected result: 44 requests, 76 assertions, 0 failed. It takes about 50 seconds, because the requests to `/api/v1/auth/` are paced: the proxy lets through six at once and then one every six seconds.

## What each folder proves

| Folder | Proves | Requirement |
|---|---|---|
| 0 · Environment | The API is alive and the database schema is up to date | |
| 1 · Authentication | Registration, sign-in with a 15 minute access token, profile, 401 without a token and with a tampered one, 401 for a wrong password that does not reveal whether the account exists | RF-01 |
| 2 · Roles | A customer gets 403 on administration; the administrator gets 200 | RF-01 |
| 3 · Catalogue and stock | The administrator creates a category, a product and a variant, registers 5 units, and the ledger shows the entry with its balance, the user and the time; an adjustment without a reason is refused; the store finds the product | RF-02, RF-03 |
| 4 · Cart | Asking for 6 units when 5 exist answers 409 `INSUFFICIENT_STOCK`; 2 units total exactly `200.00` as decimal strings | RF-04 |
| 5 · Coupons | A coupon below its minimum answers 422 `COUPON_MINIMUM_NOT_MET`; an expired one answers `COUPON_EXPIRED` | RF-05 |
| 6 · Checkout and idempotency | Starting the payment reserves the stock for about 15 minutes; confirming creates the order `PED-AAAA-NNNNNN`; confirming again with the same `Idempotency-Key` returns the same order, not a second one | RF-06 |
| 7 · Ownership of data | A second customer reads, pays or cancels the first one's order and always gets 404 | RF-01 |
| 8 · Order lifecycle, reports and audit log | The history of the order, a forbidden transition answers `INVALID_STATE_TRANSITION`, the customer cancels, the stock is available again, the audit log says who changed the status, and the sales summary answers | RF-07, RF-08, RF-09 |
| 9 · Refresh token rotation | Each renewal gives a new refresh token; presenting the old one answers 401 `REFRESH_TOKEN_REUSED` and closes the session | RF-01 |

Run folder 9 last: it ends the customer session on purpose. The full list of acceptance criteria and the test behind each one is in the [acceptance criteria map](../../quality/acceptance-criteria-map.md).

## Explore the whole API

For the 73 operations, import `docs/api/openapi/openapi.yaml` in Postman (Import, then the file): it generates one request per operation, grouped by module, with the shape of every body and answer. The collection of this folder is the part that has assertions.

## If something fails

| What you see | What it means |
|---|---|
| `Set adminPassword to SEED_ADMIN_PASSWORD…` | The password slot of the environment is empty. Fill it as described above |
| `429 Too Many Requests` on sign-in | Five attempts in one minute were used. Wait a minute and run again |
| `401` on the administrator sign-in | The password is not the one in your `.env`. If you deleted `.env` and ran `npm run up` again without `docker compose down --volumes`, the accounts keep the old password: recreate the volumes |
| Connection refused | The stack is not running or `baseUrl` is wrong. Check `npm run up` and `http://localhost:8080/health/live` |
