import { z } from 'zod';

// Los mensajes son claves de i18n; los límites repiten los del API (docs/api/openapi): el servidor sigue decidiendo.
const required = (max: number) =>
  z
    .string()
    .trim()
    .min(1, { error: 'checkout.address.validation.required' })
    .max(max, { error: 'checkout.address.validation.tooLong' });

const optional = (max: number) =>
  z.string().trim().max(max, { error: 'checkout.address.validation.tooLong' });

/** Una dirección de entrega: se elige entre las guardadas o se agrega aquí mismo. */
export const addressSchema = z.object({
  label: required(40),
  recipient: required(120),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+() -]{6,20}$/, { error: 'checkout.address.validation.phoneInvalid' }),
  line1: required(200),
  line2: optional(200),
  municipality: required(80),
  department: required(80),
  reference: optional(200),
});

export type AddressValues = z.infer<typeof addressSchema>;
