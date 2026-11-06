import { defineConfig, devices } from '@playwright/test';

// Las pruebas de extremo a extremo corren contra el stack completo (npm run up), por la misma puerta que usa el revisor.
// Un solo trabajador: comparten el límite de /auth del borde (10 por minuto) y los datos de demostración.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
