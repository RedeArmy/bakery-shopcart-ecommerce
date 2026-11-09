// cspell:disable
import { expect, test } from './fixtures';

// El administrador usa la pestaña de personal que comparte toda la ejecución (fixtures.ts): no inicia sesión aquí. Navega con el
// menú, sin recargar, para no renovar la sesión.
test('the administrator creates a product sold by the dozen and by the bag of 6 from the same units and moves its inventory', async ({
  staff: page,
}) => {
  await page.getByRole('banner').getByRole('link', { name: 'Inventario' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Inventario' })).toBeVisible();
  const main = page.getByRole('main');

  // Las categorías salen en orden alfabético. Se elige la última: el producto de la prueba se queda en el catálogo compartido y así
  // no altera las cuentas de las categorías que usan las otras pruebas (Cupcakes, Pasteles)
  const categories = page.getByLabel('Categoría');
  await expect(categories.locator('option')).not.toHaveCount(1, { timeout: 30_000 });
  await categories.selectOption({ index: (await categories.locator('option').count()) - 1 });
  await expect(page).toHaveURL(/category=\d+/);
  await expect(
    main.getByRole('listitem').first().or(main.getByText('Esta categoría aún no tiene productos')),
  ).toBeVisible();

  // Se crea un producto completo en la ventana; el nombre empieza por «AAA» para salir primero en la lista alfabética
  const stamp = Date.now();
  const name = `AAA Prueba extremo a extremo ${stamp}`;
  await main.getByRole('button', { name: 'Crear producto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Crear producto' });
  await expect(dialog).toBeVisible();

  // Sin lo obligatorio no se crea nada y se explica
  await dialog.getByRole('button', { name: 'Crear producto' }).click();
  await expect(dialog.getByText('Escriba el nombre del producto.')).toBeVisible();

  await dialog.getByLabel('Nombre del producto').fill(name);
  // Los empaques comparten una sola existencia en unidades: 54 unidades dan 4 docenas y 9 bolsas de 6
  await dialog.getByLabel('Los empaques comparten una sola existencia en unidades').check();
  await dialog.getByLabel(/^Unidades con las que empieza/).fill('54');
  const first = dialog.getByRole('group', { name: 'Variante 1' });
  await first.getByLabel('Código (SKU)').fill(`E2E-${stamp}-12`);
  await first.getByLabel('Precio').fill('45');
  await first.getByLabel('Unidades por paquete').fill('12');
  await first.getByLabel(/^Atributo/).fill('Tamaño');
  await first.getByLabel(/^Valor del atributo/).fill('Docena');
  await dialog.getByRole('button', { name: 'Agregar otra variante' }).click();
  const second = dialog.getByRole('group', { name: 'Variante 2' });
  await second.getByLabel('Código (SKU)').fill(`E2E-${stamp}-06`);
  await second.getByLabel('Precio').fill('25');
  await second.getByLabel('Unidades por paquete').fill('6');
  await second.getByLabel(/^Atributo/).fill('Tamaño');
  await second.getByLabel(/^Valor del atributo/).fill('Bolsa de 6');
  await dialog.getByRole('button', { name: 'Crear producto' }).click();

  // El producto nuevo queda abierto: una sola existencia de 54 unidades y los paquetes de cada empaque
  await expect(dialog).toBeHidden();
  await expect(main.getByRole('heading', { name })).toBeVisible();
  await expect(main.getByText('Existencia compartida por sus empaques: 54 unidades')).toBeVisible();
  await expect(main.getByText(/9 paquetes de 6 unidades en existencia/)).toBeVisible();
  await expect(main.getByText(/4 paquetes de 12 unidades en existencia/)).toBeVisible();
  await expect(main.getByText(/sobran 6 unidades/)).toBeVisible();

  // Se abre el libro por la bolsa: es el de las 54 unidades compartidas
  await main
    .getByRole('listitem')
    .filter({ hasText: 'Bolsa de 6' })
    .getByRole('button', { name: 'Ver movimientos' })
    .click();
  await expect(main.getByText('Stock inicial al crear el producto')).toBeVisible();

  // Sin motivo no se envía nada y se explica
  const entry = main.getByRole('form', { name: 'Registrar entrada' });
  await entry.getByLabel('Unidades que llegaron').fill('4');
  await entry.getByRole('button', { name: 'Registrar entrada' }).click();
  await expect(entry.getByText('Explique el motivo: queda anotado en el libro.')).toBeVisible();

  // Con motivo se registra: 58 unidades son 9 bolsas de 6 y sobran 4, y 4 docenas y sobran 10
  const reason = `Prueba de extremo a extremo ${stamp}`;
  await entry.getByLabel('Motivo').fill(reason);
  await entry.getByRole('button', { name: 'Registrar entrada' }).click();
  await expect(entry.getByText('Movimiento registrado.')).toBeVisible();
  await expect(main.getByText(reason)).toBeVisible();
  await expect(main.getByText('Existencia compartida por sus empaques: 58 unidades')).toBeVisible();
  await expect(main.getByText(/sobran 4 unidades/)).toBeVisible();

  // Se deja de vender la docena: la existencia y la bolsa siguen donde estaban
  const dozenRow = main.getByRole('listitem').filter({ hasText: `E2E-${stamp}-12` });
  await dozenRow.getByRole('button', { name: 'Dejar de vender' }).click();
  await dozenRow.getByRole('button', { name: 'Sí, dejar de venderlo' }).click();
  await expect(dozenRow.getByText('Desactivada')).toBeVisible();
  await expect(main.getByText('Existencia compartida por sus empaques: 58 unidades')).toBeVisible();
  await expect(main.getByText(/9 paquetes de 6 unidades en existencia/)).toBeVisible();
});
