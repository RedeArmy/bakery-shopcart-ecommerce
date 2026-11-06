import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, visibleNavItems } from '../../src/app/navigation';
import type { NavItem } from '../../src/app/navigation';
import { routeAccess } from '../../src/app/route-access';
import { redirectTarget } from '../../src/features/auth/model/sign-in-redirect';
import type { SessionState } from '../../src/shared/auth/session-store';

const user = (role: 'Customer' | 'Operator' | 'Administrator'): SessionState => ({
  status: 'authenticated',
  accessToken: 'token',
  user: { idUser: 1, role, email: 'a@b.test', fullName: 'Ana', phone: null, isActive: true },
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
});

describe('redirectTarget', () => {
  it('goes back to where the customer was heading', () => {
    expect(redirectTarget({ from: '/orders/5?tab=payment' })).toBe('/orders/5?tab=payment');
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
