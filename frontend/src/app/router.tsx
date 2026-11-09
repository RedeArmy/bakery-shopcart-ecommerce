import { createBrowserRouter } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { HomePage } from '../features/catalogue/pages/home-page';
import { Layout } from './layout';
import { ProtectedRoute } from './protected-route';
import { NotFoundPage } from './pages/not-found-page';
import { Splash } from './pages/splash';

// Cada pantalla se carga al visitarla (code splitting): el inicio llega rápido y el resto no pesa en la primera carga.
// Las rutas protegidas por rol (<ProtectedRoute roles>) se agregan junto a cada pantalla que las necesite.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    // Sin esto, entrar directo a una pantalla de carga diferida dejaría la página en blanco hasta que llegue su código
    HydrateFallback: Splash,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'catalogue',
        lazy: async () => ({
          Component: (await import('../features/catalogue/pages/catalogue-page')).CataloguePage,
        }),
      },
      {
        path: 'catalogue/:id',
        lazy: async () => ({
          Component: (await import('../features/catalogue/pages/product-page')).ProductPage,
        }),
      },
      {
        path: 'cart',
        lazy: async () => ({
          Component: (await import('../features/cart/pages/cart-page')).CartPage,
        }),
      },
      {
        // El pago no exige cuenta: quien no tiene sesión compra como invitado o entra, y la pantalla lo resuelve (ADR-0027)
        path: 'checkout',
        lazy: async () => ({
          Component: (await import('../features/checkout/pages/checkout-page')).CheckoutPage,
        }),
      },
      {
        path: 'login',
        lazy: async () => ({
          Component: (await import('../features/auth/pages/login-page')).LoginPage,
        }),
      },
      {
        path: 'register',
        lazy: async () => ({
          Component: (await import('../features/auth/pages/register-page')).RegisterPage,
        }),
      },
      {
        // Consultar un pedido con su número y su correo es para cualquiera: la lista propia solo se ve con sesión de cliente
        path: 'orders',
        lazy: async () => ({
          Component: (await import('../features/orders/pages/orders-page')).OrdersPage,
        }),
      },
      {
        // El detalle de un pedido y su pago son del cliente (incluido el invitado, que también es Customer)
        element: <ProtectedRoute roles={['Customer']} />,
        children: [
          {
            path: 'orders/:id',
            lazy: async () => ({
              Component: (await import('../features/orders/pages/order-page')).OrderPage,
            }),
          },
          {
            path: 'orders/:id/payment',
            lazy: async () => ({
              Component: (await import('../features/payments/pages/payment-page')).PaymentPage,
            }),
          },
        ],
      },
      {
        // Las sucursales las mantiene un administrador
        element: <ProtectedRoute roles={['Administrator']} />,
        children: [
          {
            path: 'admin/branches',
            lazy: async () => ({
              Component: (await import('../features/branches/pages/branches-page')).BranchesPage,
            }),
          },
          {
            path: 'admin/payment-methods',
            lazy: async () => ({
              Component: (await import('../features/payment-methods/pages/payment-methods-page'))
                .PaymentMethodsPage,
            }),
          },
        ],
      },
      {
        // La revisión de pagos la hace quien atiende: un operador o un administrador
        element: <ProtectedRoute roles={['Operator', 'Administrator']} />,
        children: [
          {
            // Cada rol ve su panel: el administrador los reportes y el operador lo que hay que atender
            path: 'admin',
            lazy: async () => ({
              Component: (await import('../features/dashboard/pages/dashboard-page')).DashboardPage,
            }),
          },
          {
            path: 'admin/orders',
            lazy: async () => ({
              Component: (await import('../features/staff-orders/pages/staff-orders-page'))
                .StaffOrdersPage,
            }),
          },
          {
            path: 'admin/orders/:id',
            lazy: async () => ({
              Component: (await import('../features/staff-orders/pages/staff-order-page'))
                .StaffOrderPage,
            }),
          },
          {
            path: 'admin/payments/deposits',
            lazy: async () => ({
              Component: (await import('../features/payment-review/pages/deposit-review-page'))
                .DepositReviewPage,
            }),
          },
          {
            path: 'admin/payments/cash',
            lazy: async () => ({
              Component: (await import('../features/payment-review/pages/cash-payments-page'))
                .CashPaymentsPage,
            }),
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
