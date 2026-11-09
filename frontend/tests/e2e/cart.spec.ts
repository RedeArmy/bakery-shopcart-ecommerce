// cspell:disable
import { expect, test } from './fixtures';

// Usan los datos de demostración (npm run up con SEED_DEMO_DATA=true): Galletas de avena (del mismo día, Q45.00), Pastel
// Tres Leches (por encargo, Q145.00).
// El borde deja pasar 10 llamadas por minuto a /auth (ráfaga de 5): esta prueba usa 1 (la sesión de invitado) y la de la
// sesión, que además cubre al cliente con cuenta (productos por encargo, personalización), otras 4.

test('a visitor buys as a guest, with the coupon, the made-to-order products and the personalisation locked, sends the proof, the staff approves the deposit, confirms the cash, delivers the order and registers a return', async ({
  page,
  staffSession: staff,
}) => {
  // Es un recorrido largo: la compra del invitado y el trabajo del personal sobre sus pedidos. Con la base de datos fría una sola
  // llamada llegó a tardar 6 s, y el recorrido tiene más de veinte: el tiempo de una prueba normal no alcanza
  test.setTimeout(180_000);

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

  // En el pago elige comprar como invitado, y da su contacto
  await summary.getByRole('link', { name: 'Continuar con el pago' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Finalizar compra' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await expect(header.getByRole('link', { name: 'Carrito, 3 productos' })).toBeVisible();
  await page.getByLabel('Nombre completo').fill('Invitado');
  const guestEmail = `guest-${String(Date.now())}@shopcart.test`;
  await page.getByLabel('Correo electrónico').fill(guestEmail);
  await page.getByRole('button', { name: 'Guardar datos' }).click();
  await expect(page.getByText('Datos guardados')).toBeVisible();
  // El pedido se consulta después con su número: ya no hay código de recuperación
  await expect(page.getByRole('button', { name: 'Generar mi código' })).toHaveCount(0);
  // El total sigue siendo el del carrito: sin descuento
  await expect(page.getByRole('complementary').getByText('Q135.00').first()).toBeVisible();

  // La personalización queda bloqueada para el invitado, con el camino para tener una cuenta
  await expect(page.getByText('La personalización necesita una cuenta')).toBeVisible();
  await expect(page.getByLabel(/Mensaje para/)).toHaveCount(0);
  await page.getByRole('button', { name: 'La personalización necesita una cuenta' }).click();
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Crear cuenta' }).first(),
  ).toBeVisible();

  // La fecha la define el sistema y se muestra como un estimado: no hay calendario. Después, la dirección de entrega, la
  // reserva de 15 minutos y la confirmación del pedido
  await expect(page.getByText(/La fecha estimada de entrega es el/)).toBeVisible();
  await expect(page.getByText(/Es un estimado/)).toBeVisible();
  await expect(page.getByLabel('Día de entrega')).toHaveCount(0);
  await page.getByLabel('Nombre de la dirección').fill('Casa');
  await page.getByLabel('Quién recibe').fill('Invitado');
  await page.getByLabel('Teléfono de quien recibe').fill('5555-1234');
  await page.getByLabel('Municipio').fill('Guatemala');
  await page.getByLabel('Departamento').fill('Guatemala');
  await page.getByLabel('Dirección', { exact: true }).fill('5a avenida 10-20 zona 1');
  await page.getByRole('button', { name: 'Guardar dirección' }).click();
  await expect(page.getByRole('radio', { name: /Casa · Invitado/ })).toBeVisible();

  // El método de pago es el depósito y sus cuentas se leen como texto: no se elige ninguna
  await expect(page.getByRole('heading', { level: 2, name: 'Método de pago' })).toBeVisible();
  await expect(page.getByText('Cuentas donde puede depositar')).toBeVisible();
  await expect(page.getByRole('radio', { name: /Banco de Ejemplo/ })).toHaveCount(0);
  const reserve = page.getByRole('button', { name: 'Reservar mis productos' });
  await expect(reserve).toBeEnabled();
  await reserve.click();
  await expect(page.getByText('Sus productos están reservados por')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar pedido' }).click();

  // El pedido queda pendiente del depósito, con la referencia y el monto exacto
  await expect(page).toHaveURL(/\/orders\/\d+\/payment$/);
  const title = page.getByRole('heading', { level: 1, name: /^Pedido PED-/ });
  await expect(title).toBeVisible();
  // El número del pedido es lo que el cliente conserva para consultarlo después
  const orderNumber = /PED-\d{4}-\d+/.exec((await title.textContent()) ?? '')?.[0] ?? '';
  expect(orderNumber).not.toBe('');
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

  // El pedido aparece en "Pedidos" (el invitado también es cliente), pendiente mientras se revisa el depósito
  await page.getByRole('link', { name: 'Ver el detalle del pedido' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Pedido PED-/ })).toBeVisible();
  await expect(page.getByText('Galletas de avena')).toBeVisible();
  await page.getByRole('link', { name: 'Volver a mis pedidos' }).click();
  // Un invitado no está en una cuenta: la página es «Pedidos» y debajo de la consulta están los pedidos de su sesión
  await expect(page.getByRole('heading', { level: 1, name: 'Pedidos' })).toBeVisible();
  await expect(page.getByRole('link', { name: /PED-/ }).first()).toBeVisible();

  // Otro pedido de la misma sesión, esta vez para recoger en una sucursal: no pide dirección y su detalle lo dice
  await header.getByRole('link', { name: 'Catálogo' }).click();
  await page.getByLabel('Buscar').fill('avena');
  await page.getByRole('link', { name: /Galletas de avena/ }).click();
  await page.getByRole('button', { name: 'Agregar al carrito' }).click();
  await expect(page.getByText('Agregado al carrito.')).toBeVisible();
  await page.getByRole('link', { name: 'Ver carrito' }).click();
  await page
    .getByRole('complementary')
    .getByRole('link', { name: 'Continuar con el pago' })
    .click();

  // Los dos botones son radios: se elige tocando su texto, y la sucursal aparece como tarjeta
  await page.getByText('Recoger en sucursal', { exact: true }).click();
  await page.getByRole('radio', { name: /Sucursal Centro/ }).check();
  await expect(page.getByText(/6a avenida 10-20, zona 1/)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Pasos de la compra' })).toBeVisible();
  await expect(page.getByText(/La fecha estimada para recogerlo es el/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dirección de entrega' })).toHaveCount(0);
  // Para recoger, además del depósito, se ofrece el efectivo; se paga en la sucursal y no hay comprobante
  await page.getByRole('radio', { name: /Efectivo o contra entrega/ }).check();
  await expect(
    page.getByText('Pagará en efectivo en la sucursal, al recoger su pedido.'),
  ).toBeVisible();
  const reservePickup = page.getByRole('button', { name: 'Reservar mis productos' });
  await expect(reservePickup).toBeEnabled();
  await reservePickup.click();
  await page.getByRole('button', { name: 'Confirmar pedido' }).click();

  await expect(page).toHaveURL(/\/orders\/\d+\/payment$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Pague en la sucursal' })).toBeVisible();
  const cashTitle = page.getByRole('heading', { level: 1, name: /^Pedido PED-/ });
  const cashNumber = /PED-\d{4}-\d+/.exec((await cashTitle.textContent()) ?? '')?.[0] ?? '';
  expect(cashNumber).not.toBe('');
  // El estado también habla del efectivo: el pedido queda reservado hasta que se pague en la sucursal
  await expect(page.getByText('Esperando su pago en efectivo')).toBeVisible();
  await expect(page.getByText('Esperando su depósito')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Enviar comprobante' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Ver el detalle del pedido' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Recoger en sucursal' })).toBeVisible();
  await expect(page.getByText('Sucursal Centro')).toBeVisible();
  // El detalle también habla del efectivo y no del comprobante
  await expect(
    page.getByText(/reservado hasta que llegue a la sucursal y pague en efectivo/),
  ).toBeVisible();
  await expect(page.getByText(/Cuando suba su comprobante/)).toHaveCount(0);

  // Cualquiera, con o sin cuenta, consulta el pedido desde la página principal con su número y su correo
  await page.goto('/');
  await page.getByLabel('Número de pedido').fill(orderNumber);
  await page.getByLabel('Correo del pedido').fill(guestEmail);
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(
    page.getByRole('heading', { level: 3, name: `Pedido ${orderNumber}` }),
  ).toBeVisible();
  // Ya subió su comprobante: el pedido no está «pendiente de pago» a secas, está pendiente de verificarse
  await expect(page.getByText('Pendiente de verificación de pago').first()).toBeVisible();
  // Con otro correo no se encuentra, y la respuesta no dice si el número existe
  await page.getByLabel('Correo del pedido').fill('otra-persona@shopcart.test');
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(
    page.getByText(/No encontramos un pedido con ese número y ese correo/),
  ).toBeVisible();

  // El personal atiende lo que el cliente dejó pendiente: aprueba el depósito y confirma el cobro en efectivo. Usa la pestaña de
  // personal que comparte toda la ejecución (fixtures.ts); sin la contraseña de la cuenta de demostración esta parte no se ejecuta.
  if (staff === null) return;

  // La cola de depósitos se busca por el número del pedido: el cliente dice «ya envié mi comprobante del PED-…»
  await staff.getByRole('banner').getByRole('link', { name: 'Depósitos' }).click();
  await expect(
    staff.getByRole('heading', { level: 1, name: 'Revisión de depósitos' }),
  ).toBeVisible();
  await staff.getByLabel('Buscar un pedido').fill(orderNumber);
  await staff.getByRole('button', { name: 'Buscar' }).click();
  const deposit = staff.getByRole('listitem').filter({ hasText: orderNumber });
  await expect(deposit.getByText('Q135.00').first()).toBeVisible();
  await expect(deposit.getByRole('button', { name: 'Ver comprobante' })).toBeVisible();
  await deposit.getByRole('button', { name: 'Aprobar' }).click();
  await expect(staff.getByText('Depósito aprobado: el pedido quedó pagado.')).toBeVisible();

  // El cliente llega a la sucursal con su número: se busca, se cobra en caja y se confirma con un segundo paso
  await staff.getByRole('banner').getByRole('link', { name: 'Cobros en efectivo' }).click();
  await expect(staff.getByRole('heading', { level: 1, name: 'Cobros en efectivo' })).toBeVisible();
  await staff.getByLabel('Buscar un pedido').fill(cashNumber);
  await staff.getByRole('button', { name: 'Buscar' }).click();
  const cash = staff.getByRole('listitem').filter({ hasText: cashNumber });
  await expect(cash.getByText('Centro')).toBeVisible();
  await cash.getByRole('button', { name: 'Confirmar cobro' }).click();
  await cash.getByRole('button', { name: 'Sí, recibí el pago' }).click();
  await expect(staff.getByText('Cobro confirmado: el pedido quedó pagado.')).toBeVisible();

  // El cliente ve sus dos pedidos pagados con la misma consulta pública, sin recargar la página: cada recarga renueva la sesión y
  // cuenta para el límite de llamadas a /auth del borde
  for (const number of [orderNumber, cashNumber]) {
    await page.getByLabel('Número de pedido').fill(number);
    await page.getByLabel('Correo del pedido').fill(guestEmail);
    await page.getByRole('button', { name: 'Consultar' }).click();
    await expect(page.getByRole('heading', { level: 3, name: `Pedido ${number}` })).toBeVisible();
    await expect(page.getByText('Pagado').first()).toBeVisible();
  }

  // El personal lleva el pedido pagado en efectivo hasta la entrega y registra la devolución de una unidad. Se busca por el número,
  // como todo lo demás, y se navega con el menú para no renovar la sesión
  await staff.getByRole('banner').getByRole('link', { name: 'Gestión de pedidos' }).click();
  await expect(staff.getByRole('heading', { level: 1, name: 'Gestión de pedidos' })).toBeVisible();
  await staff.getByLabel('Buscar pedido').fill(cashNumber);
  await staff.getByRole('button', { name: 'Buscar' }).click();
  await staff.getByRole('link', { name: new RegExp(cashNumber) }).click();
  await expect(
    staff.getByRole('heading', { level: 1, name: `Pedido ${cashNumber}` }),
  ).toBeVisible();
  // Cada paso aparece cuando el anterior se guardó: el botón de la pantalla es el único que el estado permite. Un pedido que se
  // recoge en sucursal no se despacha, y por eso el administrador de la sesión puede entregarlo
  for (const step of ['Pasar a preparación', 'Marcar como entregado']) {
    await staff.getByRole('button', { name: step }).click();
  }
  await staff.getByRole('button', { name: 'Registrar una devolución' }).click();
  await staff.getByRole('spinbutton').first().fill('1');
  await staff.getByLabel('Motivo de la devolución').fill('Llegó aplastado');
  await staff.getByRole('button', { name: 'Registrar devolución' }).click();
  await expect(staff.getByText(/Devolución registrada/)).toBeVisible();
});
