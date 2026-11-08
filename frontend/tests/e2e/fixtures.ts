// cspell:disable
import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';

// El borde deja pasar 10 llamadas por minuto a /auth (ráfaga de 5) y cada ingreso, registro, sesión de invitado o recarga con
// sesión cuenta. Por eso el personal inicia sesión UNA vez por ejecución y todas las pruebas de administración comparten esa
// pestaña (con un solo trabajador, ver playwright.config.ts): navegan con el menú, sin recargar, para no renovar la sesión.
// La contraseña de la cuenta de demostración sale del entorno (E2E_ADMIN_PASSWORD, el valor de SEED_ADMIN_PASSWORD del .env):
// nunca se escribe en el repositorio. Sin ella las pruebas de personal se omiten.

export const test = base.extend<{ staff: Page }, { staffSession: Page | null }>({
  staffSession: [
    async ({ browser }, use, workerInfo) => {
      const password = process.env['E2E_ADMIN_PASSWORD'];
      if (password === undefined) {
        await use(null);
        return;
      }
      const context = await browser.newContext({ baseURL: workerInfo.project.use.baseURL });
      const page = await context.newPage();
      await page.goto('/login');
      await page.getByLabel('Correo electrónico').fill('admin@shopcart.test');
      await page.getByLabel('Contraseña').fill(password);
      await page.getByRole('button', { name: 'Iniciar sesión' }).click();
      await expect(
        page.getByRole('banner').getByRole('link', { name: 'Sucursales' }),
      ).toBeVisible();
      await use(page);
      await context.close();
    },
    { scope: 'worker' },
  ],

  /** La pestaña del personal, ya con sesión; la prueba se omite si no hay contraseña. */
  staff: async ({ staffSession }, use) => {
    base.skip(staffSession === null, 'Falta E2E_ADMIN_PASSWORD');
    await use(staffSession as Page);
  },
});

export { expect };
