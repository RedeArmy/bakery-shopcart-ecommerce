/** Cuántas cuentas se ven por página; el API admite hasta 100. */
export const PAGE_SIZE = 15;

/** Los tres roles con el identificador que usa el API para filtrar (semilla S0001). */
export const ROLES = [
  { id: 1, name: 'Customer' },
  { id: 2, name: 'Operator' },
  { id: 3, name: 'Administrator' },
] as const;

export type RoleName = (typeof ROLES)[number]['name'];

export interface UsersQuery {
  /** Texto que se busca en el nombre y en el correo, tal cual lo busca el servidor */
  search: string;
  /** Identificador del rol (1 a 3) o `null` para todos */
  role: number | null;
  /** `true` solo las activas, `false` solo las desactivadas, `null` todas */
  active: boolean | null;
  page: number;
}

/**
 * Lo que dice la dirección: el texto buscado, el rol, el estado y la página. Lo que no se entiende vuelve al valor por omisión en
 * lugar de romper la pantalla.
 */
export function parseUsersQuery(params: URLSearchParams): UsersQuery {
  const role = Number(params.get('role') ?? '');
  const page = Number(params.get('page') ?? '1');
  return {
    search: (params.get('q') ?? '').trim().slice(0, 100),
    role: ROLES.some((item) => item.id === role) ? role : null,
    active: activeFromValue(params.get('active') ?? ''),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** La dirección para una consulta: solo lleva lo que se aparta del valor por omisión. */
export function usersParams(query: UsersQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.search !== '') params.set('q', query.search);
  if (query.role !== null) params.set('role', String(query.role));
  if (query.active !== null) params.set('active', String(query.active));
  if (query.page > 1) params.set('page', String(query.page));
  return params;
}

/** El valor del selector de estado: vacío para todas. */
export const activeValue = (active: boolean | null): string =>
  active === null ? '' : String(active);

/** Lo que el selector de estado elige, a partir de su valor. */
export const activeFromValue = (value: string): boolean | null => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
};

/** ¿Sigue bloqueada la cuenta por intentos fallidos? Solo si el bloqueo es una fecha futura. */
export const isLocked = (
  lockedUntil: string | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (lockedUntil === null || lockedUntil === undefined) return false;
  const until = new Date(lockedUntil);
  return !Number.isNaN(until.getTime()) && until.getTime() > now.getTime();
};
