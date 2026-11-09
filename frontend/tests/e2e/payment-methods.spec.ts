// cspell:disable
import { expect, test } from './fixtures';

// El administrador usa la pestaña de personal que comparte toda la ejecución (fixtures.ts): no inicia sesión aquí.
test('an administrator adds a payment method, keeps the cash for pickups and removes it', async ({
  staff: page,
}) => {
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
