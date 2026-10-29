import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // En desarrollo la API se consume a través del proxy para evitar CORS
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    // jsdom permite montar componentes y el router del navegador en las pruebas unitarias
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      // Se mide solo el código de producción, no las pruebas ni la configuración
      include: ['src/**/*.{ts,tsx}'],
    },
  },
});
