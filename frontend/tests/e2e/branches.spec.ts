// cspell:disable
import { expect, test } from '@playwright/test';

// El borde deja pasar 10 llamadas por minuto a /auth (ráfaga de 5): este archivo usa 1 (el ingreso del administrador).
// La contraseña de la cuenta de demostración sale del entorno (E2E_ADMIN_PASSWORD, el valor de SEED_ADMIN_PASSWORD del .env):
// nunca se escribe en el repositorio. Sin ella la prueba no se registra, en lugar de saltarse.
const password = process.env['E2E_ADMIN_PASSWORD'];

if (password !== undefined) {
  test('an administrator adds a branch, edits it and removes it', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill('admin@shopcart.test');
    await page.getByLabel('Contraseña').fill(password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    // El administrador ve el mantenimiento de sucursales en el menú
    const header = page.getByRole('banner');
    await header.getByRole('link', { name: 'Sucursales' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sucursales' })).toBeVisible();
    // Las dos sucursales de demostración ya están
    await expect(page.getByText('Sucursal Centro')).toBeVisible();

    const name = `Sucursal E2E ${String(Date.now())}`;
    await page.getByRole('button', { name: 'Agregar sucursal' }).click();
    await page.getByLabel('Nombre de la sucursal').fill(name);
    await page.getByLabel('Municipio').fill('Mixco');
    await page.getByLabel('Departamento').fill('Guatemala');
    await page.getByLabel('Dirección', { exact: true }).fill('Calzada Roosevelt 5-10');
    await page.getByRole('button', { name: 'Crear sucursal' }).click();
    const card = page.getByRole('listitem').filter({ hasText: name });
    await expect(card).toBeVisible();
    await expect(card.getByText('Activa')).toBeVisible();

    // Editarla
    await card.getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('Nombre de la sucursal').fill(`${name} renovada`);
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    const renewed = page.getByRole('listitem').filter({ hasText: `${name} renovada` });
    await expect(renewed).toBeVisible();

    // Quitarla pide confirmación y la deja desactivada, a la vista pero sin acciones
    await renewed.getByRole('button', { name: 'Quitar' }).click();
    await renewed.getByRole('button', { name: 'Sí, quitarla' }).click();
    await expect(renewed.getByText('Desactivada')).toBeVisible();
    await expect(renewed.getByRole('button', { name: 'Quitar' })).toHaveCount(0);
  });
}
