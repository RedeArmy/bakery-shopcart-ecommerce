import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // La lógica pura se mide aquí; el acceso a SQL Server se prueba de extremo a extremo con un servidor real
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts', 'src/database.ts', 'src/control-tables.ts', 'src/index.ts'],
    },
  },
});
