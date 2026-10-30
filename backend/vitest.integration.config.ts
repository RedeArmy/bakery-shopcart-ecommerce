import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Contra un SQL Server real: se saltan solas si no hay servidor configurado (SQL_TEST_HOST)
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    // Un solo archivo a la vez y con tiempo de sobra: los flujos hablan con la base de datos
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
