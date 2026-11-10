import { z } from 'zod';

/** Cuántos reembolsos se piden de una vez; el API admite hasta 500 y la lista no se pagina. */
export const LIMIT = 100;

/** Lo que se puede mirar: los que esperan, los que no se pudieron hacer, los hechos o todos. */
export const FILTERS = ['Pending', 'Failed', 'Processed', 'all'] as const;
export type RefundFilter = (typeof FILTERS)[number];

export const DEFAULT_FILTER: RefundFilter = 'Pending';

/** Lo que dice la dirección. Lo que no se entiende vuelve a «pendientes» en lugar de romper la pantalla. */
export function parseRefundFilter(params: URLSearchParams): RefundFilter {
  const status = params.get('status');
  return FILTERS.find((candidate) => candidate === status) ?? DEFAULT_FILTER;
}

/** La dirección para un filtro: solo lleva lo que se aparta del valor por omisión. */
export function refundParams(filter: RefundFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter !== DEFAULT_FILTER) params.set('status', filter);
  return params;
}

/** El estado que se pide al API: «todos» no lo envía. */
export const apiStatus = (filter: RefundFilter): 'Pending' | 'Failed' | 'Processed' | undefined =>
  filter === 'all' ? undefined : filter;

// Los mensajes son claves de i18n; el límite repite el de la base de datos (80 caracteres): el servidor sigue decidiendo.
/** Marcar un reembolso como procesado exige la referencia de la transferencia con la que se devolvió el dinero. */
export const referenceSchema = z.object({
  reference: z
    .string()
    .trim()
    .min(1, { error: 'refunds.validation.referenceRequired' })
    .max(80, { error: 'refunds.validation.referenceTooLong' }),
});

export type ReferenceValues = z.infer<typeof referenceSchema>;
