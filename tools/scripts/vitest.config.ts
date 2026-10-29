import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Solo el código propio: los fixtures de arquitectura violan las reglas a propósito y no se miden
      include: ['*.ts', 'lib/**/*.ts'],
      exclude: ['arch-fixtures/**', 'tests/**', 'vitest.config.ts'],
    },
  },
});
