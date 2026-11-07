import { z } from 'zod';

// Los mensajes son claves de i18n; los límites repiten los del API (docs/api/openapi): el servidor sigue decidiendo.
const required = (max: number) =>
  z
    .string()
    .trim()
    .min(1, { error: 'branches.validation.required' })
    .max(max, { error: 'branches.validation.tooLong' });

/** Una sucursal: el nombre que ve el cliente, dónde está, cómo llamar y cuándo atiende. */
export const branchSchema = z.object({
  name: required(80),
  line1: required(200),
  municipality: required(80),
  department: required(80),
  phone: z
    .string()
    .trim()
    .refine((value) => value === '' || /^[0-9+() -]{6,20}$/.test(value), {
      error: 'branches.validation.phoneInvalid',
    }),
  openingHours: z.string().trim().max(200, { error: 'branches.validation.tooLong' }),
});

export type BranchValues = z.infer<typeof branchSchema>;

export const EMPTY_BRANCH: BranchValues = {
  name: '',
  line1: '',
  municipality: '',
  department: '',
  phone: '',
  openingHours: '',
};
