import { z } from 'zod';

/** Cuántos pagos se ven por página: el personal revisa uno a uno, así que no hace falta más. */
export const PAGE_SIZE = 10;

/** Los estados que el personal puede mirar en la cola de depósitos; «en revisión» es la cola de trabajo. */
export const DEPOSIT_STATUSES = ['UnderReview', 'Pending', 'Approved', 'Rejected'] as const;
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];

/** Los estados de un cobro en efectivo; «pendiente» es la cola de trabajo. */
export const CASH_STATUSES = ['Pending', 'Approved', 'Expired'] as const;
export type CashStatus = (typeof CASH_STATUSES)[number];

export interface ReviewQuery<T extends string> {
  status: T;
  page: number;
  search: string;
}

/**
 * Lo que dice la dirección: el estado que se mira, la página y, en el efectivo, el texto buscado. Lo que no se entiende (un
 * estado desconocido, una página que no es un entero positivo) vuelve al valor por omisión en lugar de romper la pantalla.
 */
export function parseReviewQuery<T extends string>(
  params: URLSearchParams,
  allowed: readonly T[],
  fallback: T,
): ReviewQuery<T> {
  const status = params.get('status');
  const page = Number(params.get('page'));
  return {
    status: allowed.find((value) => value === status) ?? fallback,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    search: (params.get('q') ?? '').trim().slice(0, 100),
  };
}

/** La dirección para una consulta: solo lleva lo que se aparta del valor por omisión. */
export function reviewParams<T extends string>(
  query: ReviewQuery<T>,
  fallback: T,
): URLSearchParams {
  const params = new URLSearchParams();
  if (query.status !== fallback) params.set('status', query.status);
  if (query.search !== '') params.set('q', query.search);
  if (query.page > 1) params.set('page', String(query.page));
  return params;
}

/** El motivo con el que se rechaza un depósito: el cliente lo lee. Los mensajes son claves de i18n. */
export const rejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, { error: 'depositReview.validation.reasonRequired' })
    .max(250, { error: 'depositReview.validation.reasonTooLong' }),
});

export type RejectValues = z.infer<typeof rejectSchema>;
