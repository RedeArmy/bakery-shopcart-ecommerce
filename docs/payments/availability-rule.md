# Payment method availability rule

```
cardAvailable =
     RECURRENTE_PUBLIC_KEY present
 AND RECURRENTE_SECRET_KEY present
 AND (keys are pk_test_/sk_test_  OR  RECURRENTE_WEBHOOK_SECRET present)
 AND PAYMENTS_CARD_ENABLED != "false"
 AND the probe GET /api/test answered 200 (latest check)

depositAvailable = at least one active BankAccount exists
                   AND FU_Payments_DepositWindow leaves >= MinDepositHours for the chosen delivery date
```

- An empty value in `.env` means **not configured**. **Without credentials only bank deposit is offered.**
- With `live` keys and no `RECURRENTE_WEBHOOK_SECRET`, card payments are **disabled** and an error is logged: charging without being able to verify webhooks is unsafe.
- The **probe** runs at start-up and every five minutes. If Recurrente rejects the credentials (401), the card option is hidden without bringing the API down, and returns when the gateway answers 200 again.
- The UI reads `GET /checkout/payment-methods`, but **the backend also validates**: requesting `CARD` while unavailable answers `422 PAYMENT_METHOD_UNAVAILABLE`.
- With a single method, checkout shows it preselected without a selector.
- **In Delivery Phase 1 the Recurrente adapter does not exist**, so the registry naturally returns only deposit.

```ts
// platform/config/payments.ts — vacío en .env = no configurado
const blank = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

// application/payment-methods-registry.ts
export class PaymentMethodsRegistry {
  private cardProbeOk = false;
  constructor(private env: PaymentsEnv, private gateway: PaymentGatewayPort | null, private logger: Logger) {}

  private credentialsComplete(): boolean {
    const { RECURRENTE_PUBLIC_KEY: publicKey, RECURRENTE_SECRET_KEY: secretKey, RECURRENTE_WEBHOOK_SECRET: webhookSecret } = this.env;
    if (!publicKey || !secretKey || this.env.PAYMENTS_CARD_ENABLED === 'false') return false;
    const live = publicKey.startsWith('pk_live_') || secretKey.startsWith('sk_live_');
    if (live && !webhookSecret) { this.logger.error('Recurrente in live mode without RECURRENTE_WEBHOOK_SECRET: card payments disabled'); return false; }
    return true;
  }
  /** Al arrancar y cada 5 min: una credencial inválida oculta la tarjeta sin tumbar la API. */
  async refresh() { this.cardProbeOk = !!this.gateway && this.credentialsComplete() && (await this.gateway.probe().catch(() => false)); }
  isCardAvailable() { return this.cardProbeOk; }
}
```

The configuration variables are described in the [configuration reference](../operations/configuration-reference.md). Tests for the registry cover: no keys, only the public key, `live` without a webhook secret, the flag off and a probe answering 401.
