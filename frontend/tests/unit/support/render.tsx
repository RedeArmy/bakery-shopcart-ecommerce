import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { routes } from '../../../src/app/router';
import { auth } from '../../../src/shared/auth';
import { guestSession, installFakeApi, json, session } from './fake-api';

/** Dibuja un conjunto de rutas con un router en memoria y un QueryClient sin reintentos (un fallo se ve de inmediato). */
export function renderRoutes(
  tree: RouteObject[],
  entry: string | { pathname: string; state?: unknown },
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(tree, { initialEntries: [entry] });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router };
}

/** La aplicación completa (diseño, menú y pantallas) empezando en `entry`. */
export const renderApp = (entry: string | { pathname: string; state?: unknown }) =>
  renderRoutes(routes, entry);

/** Deja la sesión única de la aplicación iniciada con el rol dado, sin pasar por una pantalla. */
export async function signInAs(role: 'Customer' | 'Operator' | 'Administrator', name = 'Ana') {
  installFakeApi({ 'POST /api/v1/auth/login': json(session(name, role)) });
  await auth.login('ana@shopcart.test', 'a long password');
}

/** Deja la sesión única de la aplicación como la de un invitado (con o sin correo de contacto). */
export async function signInAsGuest(email?: string) {
  installFakeApi({ 'POST /api/v1/auth/guest': json(guestSession(9, email)) });
  await auth.startGuest();
}

/** Devuelve la sesión única a "anónimo" para que una prueba no herede el estado de otra. */
export async function resetSession(): Promise<void> {
  installFakeApi({ 'POST /api/v1/auth/logout': new Response(null, { status: 204 }) });
  await auth.logout();
  localStorage.clear();
}

export const product = (id: number, name: string, min: string, max = min, extra = {}) => ({
  idProduct: id,
  idCategory: 1,
  categoryName: 'Pasteles',
  name,
  description: null,
  leadTimeDays: 1,
  isActive: true,
  primaryImageUrl: null,
  minPrice: min,
  maxPrice: max,
  available: 20,
  ...extra,
});

export const page = (items: unknown[], extra = {}) => ({
  items,
  page: 1,
  size: 12,
  total: items.length,
  ...extra,
});

export const category = (id: number, name: string) => ({
  idCategory: id,
  idParentCategory: null,
  name,
  description: null,
  isActive: true,
  activeProducts: 3,
  children: [],
});
