import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Solo la lógica pura se mide aquí: el orquestador necesita un SQL Server real y se prueba con "npm run sql:test"
      include: ['lib/**/*.ts'],
    },
  },
});
