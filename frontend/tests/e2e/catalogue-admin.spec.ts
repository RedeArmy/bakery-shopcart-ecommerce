// cspell:disable
import { expect, expectVisibleRetrying, test } from './fixtures';

// El administrador usa la pestaña de personal que comparte toda la ejecución (fixtures.ts): no inicia sesión aquí. Navega con el
// menú, sin recargar, para no renovar la sesión. No cambia precios ni productos de la semilla: otras pruebas leen sus valores.
test('the administrator maintains the categories and reads the products and their prices of one', async ({
  staff: page,
}) => {
  await page.getByRole('banner').getByRole('link', { name: 'Catálogos' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Mantenimiento del catálogo' }),
  ).toBeVisible();
  const main = page.getByRole('main');

  // Las categorías de demostración ya están
  await expect(main.getByRole('heading', { name: 'Pasteles', exact: true })).toBeVisible();

  // Sin nombre no se crea nada y se explica
  await main.getByRole('button', { name: 'Nueva categoría' }).click();
  const form = main.getByRole('form', { name: 'Nueva categoría' });
  await form.getByRole('button', { name: 'Crear categoría' }).click();
  await expect(form.getByText('Escriba el nombre de la categoría.')).toBeVisible();

  // Con nombre se crea; el nombre lleva una marca por ejecución porque no se repite
  const name = `Categoría E2E ${String(Date.now())}`;
  await form.getByLabel('Nombre de la categoría').fill(name);
  await form.getByRole('button', { name: 'Crear categoría' }).click();
  const card = main.getByRole('listitem').filter({ hasText: name });
  await expect(card).toBeVisible();
  await expect(card.getByText('Activo', { exact: true })).toBeVisible();

  // Se edita y se desactiva con confirmación: nunca se borra
  await card.getByRole('button', { name: 'Editar' }).click();
  await main.getByLabel('Descripción').fill('Creada por la prueba');
  await main.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(card.getByText('Creada por la prueba')).toBeVisible();
  await card.getByRole('button', { name: 'Desactivar' }).click();
  await card.getByRole('button', { name: 'Sí, desactivarla' }).click();
  await expect(card.getByText('Desactivado')).toBeVisible();

  // Los productos de una categoría, con los precios de sus variantes (solo se leen)
  await main.getByRole('button', { name: 'Productos' }).click();
  await expect(page).toHaveURL(/view=products/);
  await main.getByRole('combobox', { name: 'Categoría' }).selectOption({ label: 'Pasteles' });
  await expect(page).toHaveURL(/category=\d+/);
  const product = main.getByRole('listitem').first();
  await expectVisibleRetrying(page, product);
  await product.getByRole('button', { name: 'Precios' }).click();
  await expect(product.getByRole('button', { name: 'Cambiar precio' }).first()).toBeVisible();
});
