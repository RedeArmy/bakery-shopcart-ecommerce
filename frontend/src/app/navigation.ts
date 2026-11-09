import { STAFF_ROLES } from '../shared/auth';
import type { Role } from '../shared/auth';

export interface NavItem {
  /** Clave i18n del texto del enlace */
  labelKey: string;
  /** Texto alterno cuando se está dentro de una cuenta (el público ve `labelKey`) */
  accountLabelKey?: string;
  to: string;
  /** Sin `roles` el enlace es público; con `roles` solo lo ven esos roles */
  roles?: readonly Role[];
  /** Roles que no ven este enlace aunque sea público: el personal no compra, así que no tiene tienda ni «Mis pedidos» */
  hiddenFor?: readonly Role[];
}

/**
 * Los menús salen de esta configuración filtrada por rol, la misma idea que las rutas protegidas. Cada pantalla nueva
 * añade aquí su entrada con los roles que pueden verla.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { labelKey: 'nav.catalogue', to: '/catalogue', hiddenFor: STAFF_ROLES },
  {
    labelKey: 'nav.orders',
    accountLabelKey: 'nav.myOrders',
    to: '/orders',
    hiddenFor: STAFF_ROLES,
  },
  { labelKey: 'nav.dashboard', to: '/admin', roles: ['Operator', 'Administrator'] },
  { labelKey: 'nav.staffOrders', to: '/admin/orders', roles: ['Operator', 'Administrator'] },
  {
    labelKey: 'nav.depositReview',
    to: '/admin/payments/deposits',
    roles: ['Operator', 'Administrator'],
  },
  {
    labelKey: 'nav.cashPayments',
    to: '/admin/payments/cash',
    roles: ['Operator', 'Administrator'],
  },
  { labelKey: 'nav.inventory', to: '/admin/inventory', roles: ['Operator', 'Administrator'] },
  { labelKey: 'nav.branches', to: '/admin/branches', roles: ['Administrator'] },
  { labelKey: 'nav.paymentMethods', to: '/admin/payment-methods', roles: ['Administrator'] },
  { labelKey: 'nav.users', to: '/admin/users', roles: ['Administrator'] },
  { labelKey: 'nav.audit', to: '/admin/audit', roles: ['Administrator'] },
];

/** El texto del enlace: quien está dentro de su cuenta lee «Mis pedidos»; el visitante y el invitado, «Pedidos». */
export const navLabelKey = (item: NavItem, inAccount: boolean): string =>
  inAccount && item.accountLabelKey !== undefined ? item.accountLabelKey : item.labelKey;

export function visibleNavItems(
  role: Role | null,
  items: readonly NavItem[] = NAV_ITEMS,
): NavItem[] {
  return items.filter((item) => {
    if (role !== null && item.hiddenFor?.includes(role) === true) return false;
    return item.roles === undefined || (role !== null && item.roles.includes(role));
  });
}
