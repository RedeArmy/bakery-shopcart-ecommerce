import { defineConfig, devices } from '@playwright/test';

// Las pruebas de extremo a extremo corren contra el stack completo (npm run up), por la misma puerta que usa el revisor
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
