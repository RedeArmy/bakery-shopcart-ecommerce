import { z } from 'zod';
import type { components } from '../../../shared/api/generated/schema';
import { dayEnd, dayStart, isDateOnly } from '../../../shared/lib/date';
import { toMoneyText } from '../../catalogue/model/catalogue-query';

export type Coupon = components['schemas']['Coupon'];
export type CouponRequest = components['schemas']['CouponRequest'];

/** Cuántos cupones se ven por página; el API admite hasta 100. */
export const PAGE_SIZE = 20;

export const COUPON_TYPES = ['Percentage', 'FixedAmount'] as const;

/** Qué cupones se ven: todos, solo los vigentes ahora o solo los desactivados. */
export const FILTERS = ['all', 'active', 'inactive'] as const;
export type CouponFilter = (typeof FILTERS)[number];

export const DEFAULT_FILTER: CouponFilter = 'all';

export interface CouponsQuery {
  filter: CouponFilter;
  page: number;
}

/** Lo que dice la dirección: el filtro y la página. Lo que no se entiende vuelve a «todos» en lugar de romper la pantalla. */
export function parseCouponsQuery(params: URLSearchParams): CouponsQuery {
  const status = params.get('status');
  const page = Number(params.get('page') ?? '1');
  return {
    filter: FILTERS.find((candidate) => candidate === status) ?? DEFAULT_FILTER,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** La dirección para una consulta: solo lleva lo que se aparta del valor por omisión. */
export function couponsParams(query: CouponsQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.filter !== DEFAULT_FILTER) params.set('status', query.filter);
  if (query.page > 1) params.set('page', String(query.page));
  return params;
}

/** El estado que se pide al API para cada filtro. */
export const API_STATUS = { all: 'All', active: 'Active', inactive: 'Inactive' } as const;

// Los mensajes son claves de i18n; las reglas repiten las del servidor (SP_Coupons_Create): el servidor sigue decidiendo.
const limit = z
  .string()
  .trim()
  .refine((value) => value === '' || /^[1-9]\d{0,8}$/.test(value), {
    error: 'coupons.validation.limit',
  });

/** Un cupón tal como se escribe en el formulario: todo texto; los días son días de Guatemala. */
export const couponSchema = z
  .object({
    code: z.string().trim(),
    type: z.enum(COUPON_TYPES),
    value: z.string().trim(),
    minimumAmount: z.string().trim(),
    startDay: z.string().trim(),
    endDay: z.string().trim(),
    totalUsageLimit: limit,
    perCustomerUsageLimit: limit,
    category: z.string().trim(),
  })
  .superRefine((values, context) => {
    const problem = (path: string, message: string): void => {
      context.addIssue({ code: 'custom', path: [path], message });
    };
    const value = toMoneyText(values.value);
    if (value === null || Number(value) <= 0) problem('value', 'coupons.validation.value');
    else if (values.type === 'Percentage' && Number(value) > 100) {
      problem('value', 'coupons.validation.percentage');
    }
    if (values.minimumAmount !== '' && toMoneyText(values.minimumAmount) === null) {
      problem('minimumAmount', 'coupons.validation.amount');
    }
    if (!isDateOnly(values.startDay)) problem('startDay', 'coupons.validation.day');
    if (!isDateOnly(values.endDay)) problem('endDay', 'coupons.validation.day');
    else if (isDateOnly(values.startDay) && values.endDay < values.startDay) {
      problem('endDay', 'coupons.validation.reversed');
    }
  });

/** El código solo se pide al crear: de 3 a 30 letras, números, guiones o guiones bajos. */
export const CODE_PATTERN = /^[A-Za-z0-9_-]{3,30}$/;

export const newCouponSchema = couponSchema.refine((values) => CODE_PATTERN.test(values.code), {
  path: ['code'],
  error: 'coupons.validation.code',
});

export type CouponValues = z.infer<typeof couponSchema>;

export const EMPTY_COUPON: CouponValues = {
  code: '',
  type: 'Percentage',
  value: '',
  minimumAmount: '',
  startDay: '',
  endDay: '',
  totalUsageLimit: '',
  perCustomerUsageLimit: '',
  category: '',
};

/** El día de Guatemala (UTC-6) de un instante; el final de un cupón es la medianoche siguiente, que pertenece al día anterior. */
export function dayOf(instant: string, isEnd = false): string {
  const shifted = Date.parse(instant) - 6 * 3_600_000 - (isEnd ? 1 : 0);
  return new Date(shifted).toISOString().slice(0, 10);
}

/** El formulario de edición, con lo que ya tiene el cupón. */
export function valuesOf(coupon: Coupon): CouponValues {
  return {
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    minimumAmount: coupon.minimumAmount ?? '',
    startDay: coupon.startsAt === undefined ? '' : dayOf(coupon.startsAt),
    endDay: coupon.endsAt === undefined ? '' : dayOf(coupon.endsAt, true),
    totalUsageLimit: coupon.totalUsageLimit == null ? '' : String(coupon.totalUsageLimit),
    perCustomerUsageLimit:
      coupon.perCustomerUsageLimit == null ? '' : String(coupon.perCustomerUsageLimit),
    category: coupon.idCategory == null ? '' : String(coupon.idCategory),
  };
}

/**
 * Lo que se envía: los importes como texto con dos decimales (ADR-0020), el cupón vigente desde el comienzo del primer día hasta
 * el final del último, y lo que se deja vacío (mínimo, límites, categoría) sin valor. El código solo viaja al crear.
 */
export function toBody(values: CouponValues, withCode: boolean): CouponRequest {
  const optionalNumber = (text: string): number | null => (text === '' ? null : Number(text));
  return {
    ...(withCode ? { code: values.code.toUpperCase() } : {}),
    type: values.type,
    value: toMoneyText(values.value) ?? values.value,
    ...(values.minimumAmount === ''
      ? {}
      : { minimumAmount: toMoneyText(values.minimumAmount) ?? values.minimumAmount }),
    startsAt: dayStart(values.startDay),
    endsAt: dayEnd(values.endDay),
    totalUsageLimit: optionalNumber(values.totalUsageLimit),
    perCustomerUsageLimit: optionalNumber(values.perCustomerUsageLimit),
    categoryId: optionalNumber(values.category),
  };
}
