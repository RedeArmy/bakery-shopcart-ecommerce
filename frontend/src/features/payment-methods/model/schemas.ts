import { z } from 'zod';

// Los mensajes son claves de i18n; los límites repiten los del API (docs/api/openapi): el servidor sigue decidiendo.
export const KINDS = ['Deposit', 'Cash'] as const;

/** Un método de pago: su clase, el texto que ve el cliente y para qué forma de recibir el pedido se ofrece. */
export const paymentMethodSchema = z
  .object({
    kind: z.enum(KINDS),
    title: z
      .string()
      .trim()
      .min(1, { error: 'paymentMethods.validation.required' })
      .max(80, { error: 'paymentMethods.validation.tooLong' }),
    description: z.string().trim().max(300, { error: 'paymentMethods.validation.tooLong' }),
    appliesToDelivery: z.boolean(),
    appliesToPickup: z.boolean(),
  })
  .refine((values) => values.appliesToDelivery || values.appliesToPickup, {
    error: 'paymentMethods.validation.appliesToAny',
    path: ['appliesToPickup'],
  });

export type PaymentMethodValues = z.infer<typeof paymentMethodSchema>;

export const EMPTY_PAYMENT_METHOD: PaymentMethodValues = {
  kind: 'Deposit',
  title: '',
  description: '',
  appliesToDelivery: true,
  appliesToPickup: true,
};
