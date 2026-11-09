import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, navLabelKey, visibleNavItems } from '../../src/app/navigation';
import type { NavItem } from '../../src/app/navigation';
import { routeAccess } from '../../src/app/route-access';
import { redirectTarget } from '../../src/features/auth/model/sign-in-redirect';
import type { SessionState } from '../../src/shared/auth/session-store';

const user = (role: 'Customer' | 'Operator' | 'Administrator'): SessionState => ({
  status: 'authenticated',
  accessToken: 'token',
  user: {
    idUser: 1,
    role,
    email: 'a@b.test',
    fullName: 'Ana',
    phone: null,
    isActive: true,
    isGuest: false,
  },
});

describe('routeAccess', () => {
  it('waits while the session is being restored', () => {
    expect(routeAccess({ status: 'unknown', user: null, accessToken: null })).toBe('wait');
  });

  it('sends a visitor to sign in', () => {
    expect(routeAccess({ status: 'anonymous', user: null, accessToken: null })).toBe('login');
  });

  it('lets any signed-in role through a route with no roles', () => {
    expect(routeAccess(user('Customer'))).toBe('allow');
  });

  it('allows a listed role and forbids the others', () => {
    expect(routeAccess(user('Administrator'), ['Administrator'])).toBe('allow');
    expect(routeAccess(user('Operator'), ['Operator', 'Administrator'])).toBe('allow');
    expect(routeAccess(user('Customer'), ['Operator', 'Administrator'])).toBe('forbidden');
  });
});

describe('visibleNavItems', () => {
  const items: NavItem[] = [
    { labelKey: 'a', to: '/public' },
    { labelKey: 'b', to: '/customer', roles: ['Customer'] },
    { labelKey: 'c', to: '/staff', roles: ['Operator', 'Administrator'] },
    { labelKey: 'd', to: '/admin', roles: ['Administrator'] },
  ];
  const paths = (role: Parameters<typeof visibleNavItems>[0]) =>
    visibleNavItems(role, items).map((item) => item.to);

  it('shows only public links to a visitor', () => {
    expect(paths(null)).toEqual(['/public']);
  });

  it('derives the menu from the role', () => {
    expect(paths('Customer')).toEqual(['/public', '/customer']);
    expect(paths('Operator')).toEqual(['/public', '/staff']);
    expect(paths('Administrator')).toEqual(['/public', '/staff', '/admin']);
  });

  it('has the catalogue as a public entry in the real configuration', () => {
    expect(visibleNavItems(null, NAV_ITEMS).map((item) => item.to)).toContain('/catalogue');
  });

  it('keeps the shop and the orders away from the staff, who do not buy', () => {
    const of = (role: Parameters<typeof visibleNavItems>[0]) =>
      visibleNavItems(role, NAV_ITEMS).map((item) => item.to);
    for (const role of ['Operator', 'Administrator'] as const) {
      expect(of(role)).not.toContain('/catalogue');
      expect(of(role)).not.toContain('/orders');
    }
    expect(of('Customer')).toEqual(expect.arrayContaining(['/catalogue', '/orders']));
    expect(of(null)).toEqual(expect.arrayContaining(['/catalogue', '/orders']));
  });

  it('hides a link from the roles it lists in hiddenFor', () => {
    const items: NavItem[] = [
      { labelKey: 'a', to: '/a', hiddenFor: ['Operator'] },
      { labelKey: 'b', to: '/b' },
    ];
    expect(visibleNavItems('Operator', items).map((item) => item.to)).toEqual(['/b']);
    expect(visibleNavItems('Customer', items).map((item) => item.to)).toEqual(['/a', '/b']);
    expect(visibleNavItems(null, items).map((item) => item.to)).toEqual(['/a', '/b']);
  });

  it('gives each staff role the dashboard first, and no one else', () => {
    const of = (role: Parameters<typeof visibleNavItems>[0]) =>
      visibleNavItems(role, NAV_ITEMS).map((item) => item.to);
    expect(of('Operator')).toEqual(expect.arrayContaining(['/admin']));
    expect(of('Administrator')).toEqual(expect.arrayContaining(['/admin']));
    // Va antes que el resto de las entradas del personal
    expect(of('Operator').indexOf('/admin')).toBeLessThan(of('Operator').indexOf('/admin/orders'));
    expect(of('Customer')).not.toContain('/admin');
    expect(of(null)).not.toContain('/admin');
  });

  it('gives the order administration to the staff and keeps it away from customers and visitors', () => {
    const of = (role: Parameters<typeof visibleNavItems>[0]) =>
      visibleNavItems(role, NAV_ITEMS).map((item) => item.to);
    expect(of('Operator')).toContain('/admin/orders');
    expect(of('Administrator')).toContain('/admin/orders');
    expect(of('Customer')).not.toContain('/admin/orders');
    expect(of(null)).not.toContain('/admin/orders');
  });

  it('gives the payment review to the staff and keeps it away from customers and visitors', () => {
    const reviewPaths = ['/admin/payments/deposits', '/admin/payments/cash'];
    const of = (role: Parameters<typeof visibleNavItems>[0]) =>
      visibleNavItems(role, NAV_ITEMS).map((item) => item.to);
    expect(of('Operator')).toEqual(expect.arrayContaining(reviewPaths));
    expect(of('Administrator')).toEqual(expect.arrayContaining(reviewPaths));
    expect(of('Customer')).not.toContain('/admin/payments/cash');
    expect(of(null)).not.toContain('/admin/payments/deposits');
    // Las sucursales y los métodos de pago siguen siendo solo del administrador
    expect(of('Operator')).not.toContain('/admin/branches');
  });
});

describe('redirectTarget', () => {
  it('goes back to where the customer was heading', () => {
    expect(redirectTarget({ from: '/orders/5?tab=payment' })).toBe('/orders/5?tab=payment');
  });

  it('takes the staff to the dashboard when they came without a destination, and the rest to the shop', () => {
    expect(redirectTarget(undefined, 'Operator')).toBe('/admin');
    expect(redirectTarget(null, 'Administrator')).toBe('/admin');
    expect(redirectTarget(undefined, 'Customer')).toBe('/');
    expect(redirectTarget(undefined, null)).toBe('/');
    // Un destino propio se respeta, y uno peligroso o sin sentido vuelve al inicio de su rol
    expect(redirectTarget({ from: '/admin/orders?status=2' }, 'Operator')).toBe(
      '/admin/orders?status=2',
    );
    expect(redirectTarget({ from: '//evil.example' }, 'Administrator')).toBe('/admin');
    expect(redirectTarget({ from: '/login' }, 'Operator')).toBe('/admin');
  });

  it.each([
    undefined,
    null,
    {},
    { from: 42 },
    { from: 'https://evil.example' },
    { from: '//evil.example' },
    { from: '/\\evil.example' },
    { from: 'javascript:alert(1)' },
    { from: '/login' },
    { from: '/register' },
  ])('falls back to the home page for %j', (state) => {
    expect(redirectTarget(state)).toBe('/');
  });
});

describe('navLabelKey', () => {
  const orders = NAV_ITEMS.find((item) => item.to === '/orders');

  it('uses one label for the public and another inside an account for the orders entry', () => {
    expect(orders).toBeDefined();
    if (orders === undefined) return;
    expect(navLabelKey(orders, false)).toBe('nav.orders');
    expect(navLabelKey(orders, true)).toBe('nav.myOrders');
  });

  it('keeps the text of an entry that has no alternative', () => {
    const catalogue = NAV_ITEMS.find((item) => item.to === '/catalogue');
    expect(catalogue === undefined ? null : navLabelKey(catalogue, true)).toBe('nav.catalogue');
  });
});
