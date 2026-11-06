import { z } from 'zod';

// Los mensajes son claves de i18n: el formulario las traduce, así el texto en español vive solo en los recursos.
// Los límites repiten los del API (docs/api/openapi): el servidor sigue siendo quien decide.
const email = z
  .string()
  .trim()
  .min(1, { error: 'auth.validation.emailRequired' })
  .pipe(z.email({ error: 'auth.validation.emailInvalid' }));

const fullName = z
  .string()
  .trim()
  .min(1, { error: 'auth.validation.nameRequired' })
  .max(120, { error: 'auth.validation.nameLong' });

const phone = z
  .string()
  .trim()
  .refine((value) => value === '' || /^[0-9+() -]{6,20}$/.test(value), {
    error: 'auth.validation.phoneInvalid',
  });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: 'auth.validation.passwordRequired' }),
});

export const registerSchema = z.object({
  fullName,
  email,
  phone,
  password: z
    .string()
    .min(10, { error: 'auth.validation.passwordShort' })
    .max(128, { error: 'auth.validation.passwordLong' }),
});

/** Datos de contacto del invitado: lo que pide el checkout antes de crear el pedido. */
export const guestContactSchema = z.object({ fullName, email, phone });

/** Recuperar el pedido de un invitado con su correo y el código que guardó. */
export const recoverSchema = z.object({
  email,
  code: z.string().trim().min(1, { error: 'auth.validation.codeRequired' }),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type GuestContactValues = z.infer<typeof guestContactSchema>;
export type RecoverValues = z.infer<typeof recoverSchema>;
