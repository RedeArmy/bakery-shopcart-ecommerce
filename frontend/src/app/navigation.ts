import type { Role } from '../shared/auth';

export interface NavItem {
  /** Clave i18n del texto del enlace */
  labelKey: string;
  /** Texto alterno cuando se está dentro de una cuenta (el público ve `labelKey`) */
  accountLabelKey?: string;
  to: string;
  /** Sin `roles` el enlace es público; con `roles` solo lo ven esos roles */
  roles?: readonly Role[];
}

/**
 * Los menús salen de esta configuración filtrada por rol, la misma idea que las rutas protegidas. Cada pantalla nueva
 * añade aquí su entrada con los roles que pueden verla.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { labelKey: 'nav.catalogue', to: '/catalogue' },
  { labelKey: 'nav.orders', accountLabelKey: 'nav.myOrders', to: '/orders' },
  { labelKey: 'nav.branches', to: '/admin/branches', roles: ['Administrator'] },
  { labelKey: 'nav.paymentMethods', to: '/admin/payment-methods', roles: ['Administrator'] },
];

/** El texto del enlace: quien está dentro de su cuenta lee «Mis pedidos»; el visitante y el invitado, «Pedidos». */
export const navLabelKey = (item: NavItem, inAccount: boolean): string =>
  inAccount && item.accountLabelKey !== undefined ? item.accountLabelKey : item.labelKey;

export function visibleNavItems(
  role: Role | null,
  items: readonly NavItem[] = NAV_ITEMS,
): NavItem[] {
  return items.filter(
    (item) => item.roles === undefined || (role !== null && item.roles.includes(role)),
  );
}
