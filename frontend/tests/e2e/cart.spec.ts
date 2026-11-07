// cspell:disable
import { expect, test } from '@playwright/test';

// Usan los datos de demostración (npm run up con SEED_DEMO_DATA=true): Galletas de avena (del mismo día, Q45.00), Pastel
// Tres Leches (por encargo, Q145.00).
// El borde deja pasar 10 llamadas por minuto a /auth (ráfaga de 5): esta prueba usa 1 (la sesión de invitado) y la de la
// sesión, que además cubre al cliente con cuenta (productos por encargo, personalización), otras 4.

test('a visitor buys as a guest, with the coupon, the made-to-order products and the personalisation locked, and sends the proof', async ({
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

  // El visitante compra sin cuenta, pero un cupón es de las cuentas registradas: se explica y no se crea ninguna sesión
  await page.getByRole('link', { name: 'Ver carrito' }).click();
  const summary = page.getByRole('complementary');
  await expect(summary.getByText('Q135.00').first()).toBeVisible();
  await expect(summary.getByText('Los cupones se aplican con una cuenta')).toBeVisible();
  await expect(summary.getByLabel('Cupón de descuento')).toHaveCount(0);

  // En el pago elige comprar como invitado, da su contacto y puede guardar un código para recuperar el pedido
  await summary.getByRole('link', { name: 'Continuar con el pago' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Finalizar compra' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await expect(header.getByRole('link', { name: 'Carrito, 3 productos' })).toBeVisible();
  await page.getByLabel('Nombre completo').fill('Invitado E2E');
  await page.getByLabel('Correo electrónico').fill(`e2e-guest-${Date.now()}@shopcart.test`);
  await page.getByRole('button', { name: 'Guardar datos' }).click();
  await expect(page.getByText('Datos guardados')).toBeVisible();
  await page.getByRole('button', { name: 'Generar mi código' }).click();
  await expect(page.getByText(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/)).toBeVisible();
  // El total sigue siendo el del carrito: sin descuento
  await expect(page.getByRole('complementary').getByText('Q135.00').first()).toBeVisible();

  // La personalización queda bloqueada para el invitado, con el camino para tener una cuenta
  await expect(page.getByText('La personalización necesita una cuenta')).toBeVisible();
  await expect(page.getByLabel(/Mensaje para/)).toHaveCount(0);
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Crear cuenta' }).first(),
  ).toBeVisible();

  // Dirección, una fecha en la que el depósito aún alcanza, la reserva de 15 minutos y la confirmación del pedido
  await page.getByLabel('Nombre de la dirección').fill('Casa');
  await page.getByLabel('Quién recibe').fill('Invitado E2E');
  await page.getByLabel('Teléfono de quien recibe').fill('5555-1234');
  await page.getByLabel('Municipio').fill('Guatemala');
  await page.getByLabel('Departamento').fill('Guatemala');
  await page.getByLabel('Dirección', { exact: true }).fill('5a avenida 10-20 zona 1');
  await page.getByRole('button', { name: 'Guardar dirección' }).click();
  await expect(page.getByText('Casa · Invitado E2E')).toBeVisible();

  const delivery = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
  await page.getByLabel('Día de entrega').fill(delivery.toISOString().slice(0, 10));
  await expect(page.getByText('Cuenta donde depositar')).toBeVisible();
  const reserve = page.getByRole('button', { name: 'Reservar mis productos' });
  await expect(reserve).toBeEnabled();
  await reserve.click();
  await expect(page.getByText('Sus productos están reservados por')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar pedido' }).click();

  // El pedido queda pendiente del depósito, con la referencia y el monto exacto
  await expect(page).toHaveURL(/\/orders\/\d+\/payment$/);
  await expect(page.getByRole('heading', { level: 1, name: /^Pedido PED-/ })).toBeVisible();
  await expect(page.getByText('Esperando su depósito')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cómo pagar' }).getByText('Q135.00')).toBeVisible();

  // El comprobante (un PNG mínimo) lo manda a revisión. El servidor rechaza un archivo que ya se usó en otro pago, así que
  // cada ejecución agrega al final un texto distinto: la imagen sigue siendo válida y su huella cambia.
  const png = Buffer.concat([
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
    Buffer.from(`e2e-${String(Date.now())}`),
  ]);
  await page.getByLabel('Número de boleta').fill(`E2E-${String(Date.now())}`);
  await page
    .getByLabel('Foto o PDF del comprobante')
    .setInputFiles({ name: 'comprobante.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Enviar comprobante' }).click();
  await expect(page.getByText('En revisión').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar comprobante' })).toHaveCount(0);

  // El pedido aparece en "Mis pedidos" (el invitado también es cliente), pendiente mientras se revisa el depósito
  await page.getByRole('link', { name: 'Ver el detalle del pedido' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Pedido PED-/ })).toBeVisible();
  await expect(page.getByText('Galletas de avena')).toBeVisible();
  await page.getByRole('link', { name: 'Volver a mis pedidos' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mis pedidos' })).toBeVisible();
  await expect(page.getByRole('link', { name: /PED-/ }).first()).toBeVisible();
});
