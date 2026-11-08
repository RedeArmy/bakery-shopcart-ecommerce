// cspell:disable
import { expect, test } from '@playwright/test';

// El borde deja pasar 10 llamadas por minuto a /auth (ráfaga de 5): este archivo usa 1 (el ingreso del administrador).
// La contraseña de la cuenta de demostración sale del entorno (E2E_ADMIN_PASSWORD, el valor de SEED_ADMIN_PASSWORD del .env):
// nunca se escribe en el repositorio. Sin ella la prueba no se registra, en lugar de saltarse.
const password = process.env['E2E_ADMIN_PASSWORD'];

if (password !== undefined) {
  test('an administrator adds a payment method, keeps the cash for pickups and removes it', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill('admin@shopcart.test');
    await page.getByLabel('Contraseña').fill(password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await page.getByRole('banner').getByRole('link', { name: 'Métodos de pago' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Métodos de pago' })).toBeVisible();
    // Los dos de demostración ya están
    await expect(page.getByText('Depósito o transferencia bancaria').first()).toBeVisible();
    await expect(page.getByText('Efectivo o contra entrega').first()).toBeVisible();

    const title = `Efectivo E2E ${String(Date.now())}`;
    await page.getByRole('button', { name: 'Agregar método de pago' }).click();
    await page.getByLabel('Clase').selectOption('Cash');
    // El efectivo solo se ofrece para recogidas: el formulario no deja elegir otra cosa
    await expect(
      page.getByText('El efectivo se cobra en la sucursal, así que solo se ofrece para recogidas.'),
    ).toBeVisible();
    await page.getByLabel('Nombre que ve el cliente').fill(title);
    await page.getByRole('button', { name: 'Crear método' }).click();
    const card = page.getByRole('listitem').filter({ hasText: title });
    await expect(card).toBeVisible();
    await expect(card.getByText('Se ofrece solo para recoger en sucursal.')).toBeVisible();

    // Quitarlo pide confirmación y lo deja desactivado; se puede reactivar
    await card.getByRole('button', { name: 'Quitar' }).click();
    await card.getByRole('button', { name: 'Sí, quitarlo' }).click();
    await expect(card.getByText('Desactivado')).toBeVisible();
    await card.getByRole('button', { name: 'Reactivar' }).click();
    await expect(card.getByText('Activo')).toBeVisible();
    // La prueba no deja nada a la vista del cliente: el método vuelve a quedar desactivado
    await card.getByRole('button', { name: 'Quitar' }).click();
    await card.getByRole('button', { name: 'Sí, quitarlo' }).click();
    await expect(card.getByText('Desactivado')).toBeVisible();
  });
}
