import { z } from 'zod';

// Los mensajes son claves de i18n: el formulario las traduce, así el texto en español vive solo en los recursos.
// Los límites repiten los del API (docs/api/openapi): el servidor sigue siendo quien decide.
const email = z
  .string()
  .trim()
  .min(1, { error: 'auth.validation.emailRequired' })
  .pipe(z.email({ error: 'auth.validation.emailInvalid' }));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: 'auth.validation.passwordRequired' }),
});

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, { error: 'auth.validation.nameRequired' })
    .max(120, { error: 'auth.validation.nameLong' }),
  email,
  phone: z
    .string()
    .trim()
    .refine((value) => value === '' || /^[0-9+() -]{6,20}$/.test(value), {
      error: 'auth.validation.phoneInvalid',
    }),
  password: z
    .string()
    .min(10, { error: 'auth.validation.passwordShort' })
    .max(128, { error: 'auth.validation.passwordLong' }),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
