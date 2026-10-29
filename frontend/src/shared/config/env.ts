// Configuración pública del cliente. Nunca debe contener secretos: todo lo que empieza por VITE_ es visible
export const config = {
  apiBaseUrl: (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? '/api/v1',
} as const;
