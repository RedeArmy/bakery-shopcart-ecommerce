# Card payments with Recurrente (Delivery Phase 2)

The server never collects cards: the customer pays on the Recurrente hosted page ([ADR-0005](../adr/0005-server-never-takes-cards.md)). The adapter is our own, using `fetch` ([ADR-0017](../adr/0017-own-recurrente-adapter.md)).

## What the public documentation says (verified)

| Topic | Detail |
|---|---|
| Base URL | `https://app.recurrente.com/api` |
| Authentication | Headers `X-PUBLIC-KEY` and `X-SECRET-KEY`. Credential check: `GET /api/test` |
| Create checkout | `POST /api/checkouts` with `items[{name, amount_in_cents, currency: "GTQ", quantity}]`, `success_url`, `cancel_url`. Responds with `checkout_url` |
| Query checkout | `GET /api/checkouts/:id` (with `X-SECRET-KEY`). Returns `status` (for example `paid`), `metadata`, `expires_at`, `payment`, `payment_method` |
| Sandbox vs production | Same URL; the key prefix decides (`pk_test_`/`sk_test_` or `pk_live_`/`sk_live_`). **Test keys do not send webhooks.** Test card `4242 4242 4242 4242` |
| Webhooks | Delivered through **Svix**: headers `svix-id`, `svix-timestamp`, `svix-signature` (`v1,<base64-hmac>`); a `whsec_…` secret per endpoint |
| Events | `payment_intent.succeeded`, `payment_intent.failed`, `bank_transfer_intent.*`, `subscription.*`, `setup_intent.*` |
| Webhook retries | Immediate, 1 min, 5 min, 30 min, 2 h, 6 h until a 2xx |
| `payment_intent.succeeded` payload | Includes `checkout.id`, `checkout.status`, `checkout.metadata`, `amount_in_cents`, `currency`, `fee`, `customer` |
| Refunds | `/api/refunds` exists |

## To validate on the first day of Phase 2 with test keys (do not assume)

1. Whether `POST /api/checkouts` accepts `expires_at` as input. **The design does not depend on it**: the job queries `GET /api/checkouts/:id` before expiring.
2. Exact field names of the creation response beyond `id` and `checkout_url`.
3. The body of `POST /api/refunds`, and whether a checkout can be closed with `PUT /api/checkouts/:id`.
4. Whether a `payment_intent.failed` leaves the checkout reusable (the design assumes it does).

The `bank_transfer_intent.*` methods are **not used**: the deposit in this project is our own.

## Adapter

```ts
// infrastructure/recurrente-gateway.ts — fetch con timeout; nunca se registran llaves en logs
export class RecurrenteGateway implements PaymentGatewayPort {
  constructor(private config: { baseUrl: string; publicKey: string; secretKey: string }) {}

  async createCheckout(input: CreateCheckoutInput) {
    const response = await fetch(`${this.config.baseUrl}/checkouts`, {
      method: 'POST', headers: this.headers(), signal: AbortSignal.timeout(10_000), // sin reintento automático: crear otro checkout duplicaría
      body: JSON.stringify({
        items: [{ name: input.description, amount_in_cents: input.amount.toCents(), currency: 'GTQ', quantity: 1 }], // una sola línea
        success_url: input.successUrl, cancel_url: input.cancelUrl, metadata: input.metadata,
      }),
    });
    if (!response.ok) throw new AppError(502, 'GATEWAY_ERROR', 'The card payment could not be started');
    const body = await response.json();
    return { id: body.id as string, checkoutUrl: body.checkout_url as string };
  }
}
```

`getCheckout` is a read and may retry with backoff; `probe()` calls `GET /test` with a five-second timeout.

## Webhook handling

The route mounts before `express.json()` and receives the raw body.

```ts
export function verifySvix(raw: Buffer, headers: { id: string; timestamp: string; signature: string }, secret: string, toleranceSeconds = 300) {
  const age = Math.abs(Date.now() / 1000 - Number(headers.timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) throw new AppError(400, 'WEBHOOK_EXPIRED', 'Event outside tolerance'); // anti-replay
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${headers.id}.${headers.timestamp}.${raw.toString('utf8')}`).digest();
  const valid = headers.signature.split(' ').some((part) => { // la cabecera puede traer varias firmas: "v1,xxx v1,yyy"
    const [version, encoded] = part.split(',');
    const received = Buffer.from(encoded ?? '', 'base64');
    return version === 'v1' && received.length === expected.length && timingSafeEqual(received, expected); // tiempo constante
  });
  if (!valid) throw new AppError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Invalid signature');
}
```

Use case `ProcessRecurrenteWebhook`:

1. Verify the signature. On failure answer **401** (Recurrente will retry).
2. `SP_Payments_RegisterWebhookEvent`. If the message already existed, answer **200** immediately.
3. `payment_intent.succeeded`: find the payment by `checkout.id` (fallback `metadata`), validate `amount_in_cents / 100 = Payment.Amount` and `currency = 'GTQ'`, call `SP_Payments_ConfirmPayment` (source `Webhook`, with `fee` as provider fee).
4. `payment_intent.failed` and any other event: record and answer 200 without changing states.
5. Answer **2xx quickly**; an internal error answers 500 to trigger a retry (idempotency makes it safe).

## Three confirmation paths

1. Signed webhook (production keys).
2. `POST /orders/{id}/payment/verify` when the customer returns (the only path with test keys besides the job).
3. `reconcileCards` job every 2 minutes: queries each pending card checkout and confirms if `paid`.

## Simulator

`tools/recurrente-simulator` (compose profile `payments-sandbox`) implements `GET /api/test`, `POST /api/checkouts`, `GET /api/checkouts/:id`, a page with "Pay" and "Fail" buttons and a **Svix-signed** webhook to the API. The API uses it by changing only `RECURRENTE_BASE_URL` and using sample keys; the adapter does not change. This matters because the brief penalises features that do not run in the delivered environment.
