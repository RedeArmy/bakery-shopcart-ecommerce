import { z } from 'zod';

// Los mensajes son claves de i18n; el servidor sigue decidiendo si el número y el correo son de un pedido.
// El número tiene el formato PED-AAAA-NNNNNN (el identificador del pedido, desde seis cifras).
export const trackSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .min(1, { error: 'track.validation.orderNumberRequired' })
    .regex(/^PED-\d{4}-\d{6,}$/i, { error: 'track.validation.orderNumberInvalid' }),
  // Se valida con el validador de correo de zod, cuya expresión no retrocede de forma costosa
  email: z
    .string()
    .trim()
    .min(1, { error: 'track.validation.emailRequired' })
    .pipe(z.email({ error: 'track.validation.emailInvalid' })),
});

export type TrackValues = z.infer<typeof trackSchema>;
