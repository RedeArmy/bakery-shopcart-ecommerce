import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Solo las pruebas unitarias corren con "npm test"; integración y concurrencia llegan con la Etapa 2
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Se mide solo el código de producción, no las pruebas ni la configuración
      include: ['src/**/*.ts'],
    },
  },
});
