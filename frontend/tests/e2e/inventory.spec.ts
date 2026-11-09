// cspell:disable
import { expect, test } from './fixtures';

// El administrador usa la pestaña de personal que comparte toda la ejecución (fixtures.ts): no inicia sesión aquí. Navega con el
// menú, sin recargar, para no renovar la sesión.
test('the administrator picks a category, creates a product with starting stock and moves its inventory', async ({
  staff: page,
}) => {
  await page.getByRole('banner').getByRole('link', { name: 'Inventario' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Inventario' })).toBeVisible();
  const main = page.getByRole('main');

  // Las categorías salen en orden alfabético; se elige la primera
  const categories = page.getByLabel('Categoría');
  await expect(categories.locator('option')).not.toHaveCount(1);
  await categories.selectOption({ index: 1 });
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
  const variant = dialog.getByRole('group', { name: 'Variante 1' });
  await variant.getByLabel('Código (SKU)').fill(`E2E-${stamp}`);
  await variant.getByLabel('Precio').fill('45');
  await variant.getByLabel(/^Unidades con las que empieza/).fill('4');
  await dialog.getByRole('button', { name: 'Crear producto' }).click();

  // El producto nuevo queda abierto, con su variante y las 4 unidades con las que empezó
  await expect(dialog).toBeHidden();
  await expect(main.getByRole('heading', { name })).toBeVisible();
  await expect(main.getByText(/4 unidades en existencia/)).toBeVisible();
  await main.getByRole('button', { name: 'Ver movimientos' }).click();
  await expect(main.getByText('Stock inicial al crear el producto')).toBeVisible();

  // Sin motivo no se envía nada y se explica
  const entry = main.getByRole('form', { name: 'Registrar entrada' });
  await entry.getByLabel('Unidades que llegaron').fill('3');
  await entry.getByRole('button', { name: 'Registrar entrada' }).click();
  await expect(entry.getByText('Explique el motivo: queda anotado en el libro.')).toBeVisible();

  // Con motivo se registra y el movimiento aparece en el libro
  const reason = `Prueba de extremo a extremo ${stamp}`;
  await entry.getByLabel('Motivo').fill(reason);
  await entry.getByRole('button', { name: 'Registrar entrada' }).click();
  await expect(entry.getByText('Movimiento registrado.')).toBeVisible();
  await expect(main.getByText(reason)).toBeVisible();
});
