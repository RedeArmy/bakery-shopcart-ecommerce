// cspell:disable
import { expect, test } from '@playwright/test';

// Usan los datos de demostración (npm run up con SEED_DEMO_DATA=true): Galletas de avena (del mismo día, Q45.00), Pastel
// Tres Leches (por encargo, Q145.00) y el cupón WELCOME10 (10 % con mínimo de Q100.00, un uso por cliente).
// El borde deja pasar 10 llamadas por minuto a /auth (ráfaga de 5): esta prueba usa 1 (la sesión de invitado) y la de la
// sesión, que además cubre al cliente con cuenta (productos por encargo, personalización), otras 4.

test('a visitor uses a coupon and checks out as a guest, with the made-to-order products and the personalisation locked', async ({
  page,
}) => {
  const header = page.getByRole('banner');

  // Un producto por encargo no se pide sin cuenta: se explica en lugar de ofrecer el botón
  await page.goto('/catalogue');
  await page.getByLabel('Buscar').fill('tres leches');
  await page.getByRole('link', { name: /Pastel Tres Leches/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Pastel Tres Leches' })).toBeVisible();
  await expect(page.getByText('Este producto se prepara por encargo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar al carrito' })).toHaveCount(0);

  // Uno del mismo día sí: tres unidades de galletas
  await header.getByRole('link', { name: 'Catálogo' }).click();
  await page.getByLabel('Buscar').fill('avena');
  await page.getByRole('link', { name: /Galletas de avena/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Galletas de avena' })).toBeVisible();
  await expect(page.getByLabel(/Inscripción|Mensaje/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Una unidad más' }).click();
  await page.getByRole('button', { name: 'Una unidad más' }).click();
  await page.getByRole('button', { name: 'Agregar al carrito' }).click();
  await expect(page.getByText('Agregado al carrito.')).toBeVisible();
  await expect(header.getByRole('link', { name: 'Carrito, 3 productos' })).toBeVisible();

  // Sin cuenta ni sesión se aplica el cupón: la sesión de invitado se abre sola y el descuento lo calcula la base de datos
  await page.getByRole('link', { name: 'Ver carrito' }).click();
  const summary = page.getByRole('complementary');
  await expect(summary.getByText('Q135.00').first()).toBeVisible();
  await summary.getByLabel('Cupón de descuento').fill('WELCOME10');
  await summary.getByRole('button', { name: 'Aplicar cupón' }).click();
  await expect(summary.getByText('WELCOME10')).toBeVisible();
  await expect(summary.getByText('−Q13.50')).toBeVisible();
  await expect(summary.getByText('Q121.50')).toBeVisible();
  await expect(header.getByRole('link', { name: 'Carrito, 3 productos' })).toBeVisible();

  // En el pago el invitado da su contacto y puede guardar un código para recuperar el pedido
  await summary.getByRole('link', { name: 'Continuar con el pago' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Finalizar compra' })).toBeVisible();
  await page.getByLabel('Nombre completo').fill('Invitado E2E');
  await page.getByLabel('Correo electrónico').fill(`e2e-guest-${Date.now()}@shopcart.test`);
  await page.getByRole('button', { name: 'Guardar datos' }).click();
  await expect(page.getByText('Datos guardados')).toBeVisible();
  await page.getByRole('button', { name: 'Generar mi código' }).click();
  await expect(page.getByText(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/)).toBeVisible();

  // La personalización queda bloqueada para el invitado, con el camino para tener una cuenta
  await expect(page.getByText('La personalización necesita una cuenta')).toBeVisible();
  await expect(page.getByLabel(/Mensaje para/)).toHaveCount(0);
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Crear cuenta' }).first(),
  ).toBeVisible();
});
