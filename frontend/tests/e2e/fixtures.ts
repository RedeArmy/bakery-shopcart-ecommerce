// cspell:disable
import { expect, test as base } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

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
      // El personal entra a su panel y no a la tienda
      await expect(page).toHaveURL(/\/admin$/);
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

/**
 * Espera a que algo se vea y, si la pantalla muestra un error con «Reintentar», lo pulsa y sigue esperando, como haría una persona.
 * El servidor limita por minuto las lecturas públicas desde una misma dirección y la suite las hace todas desde una: una lista que
 * la primera vez llega con error no es un defecto de la pantalla, que ya ofrece reintentar.
 */
export async function expectVisibleRetrying(
  page: Page,
  target: Locator,
  timeoutMs = 60_000,
): Promise<void> {
  await expect(async () => {
    const retry = page.getByRole('main').getByRole('button', { name: 'Reintentar' });
    if (await retry.isVisible()) await retry.click();
    await expect(target).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: timeoutMs });
}

export { expect };
