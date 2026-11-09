import { defineConfig, devices } from '@playwright/test';

const inCi = process.env['CI'] !== undefined;

// Las pruebas de extremo a extremo corren contra el stack completo (npm run up), por la misma puerta que usa el revisor.
// Un solo trabajador: comparten el límite de /auth del borde (10 por minuto) y los datos de demostración.
//
// Las esperas son holgadas a propósito: con la base de datos recién levantada o la máquina cargada, una llamada del flujo de
// compra llegó a tardar 6 s (SQL Server compila cada procedimiento la primera vez que lo llaman). Con 7 s de margen la prueba
// fallaba por lentitud y no por un defecto; con 15 s, una llamada lenta pasa y una que de verdad se cuelga sigue fallando.
// Antes de empezar, global-setup.ts espera a la aplicación y recorre las lecturas para que esa primera compilación no la pague
// ninguna prueba.
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  // En el CI un fallo se reintenta una vez (queda anotado como «flaky»); en local falla a la primera, que es lo que se quiere ver
  retries: inCi ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: inCi ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
