import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ApiError } from '../shared/api';
import { auth } from '../shared/auth';
import { ErrorBoundary } from './error-boundary';
import { router } from './router';

// Los fallos de red se reintentan una vez; un error de negocio (4xx) no: repetirlo daría la misma respuesta
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failures, error) =>
        failures < 1 && !(error instanceof ApiError && error.status < 500),
      refetchOnWindowFocus: false,
    },
  },
});

export function AppProviders() {
  // Al abrir la aplicación se intenta recuperar la sesión con la cookie, una sola vez
  useEffect(() => {
    void auth.restore();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
