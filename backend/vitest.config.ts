import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Solo las pruebas unitarias corren con "npm test"; integración y concurrencia llegan con la Etapa 2
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
