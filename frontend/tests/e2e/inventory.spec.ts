// cspell:disable
import { expect, test } from './fixtures';

// El administrador usa la pestaña de personal que comparte toda la ejecución (fixtures.ts): no inicia sesión aquí. Navega con el
// menú, sin recargar, para no renovar la sesión.
test('the administrator finds a product, opens a variant, registers an entry and sees it in the ledger', async ({
  staff: page,
}) => {
  await page.getByRole('banner').getByRole('link', { name: 'Inventario' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Inventario' })).toBeVisible();

  // Se busca un producto de la semilla (el catálogo de demostración) y se elige el primero
  const main = page.getByRole('main');
  await page.getByLabel('Buscar producto').fill('pastel');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await main.getByRole('button', { name: 'Elegir' }).first().click();
  await expect(page).toHaveURL(/product=\d+/);

  // Se abre el libro de la primera variante
  await main.getByRole('button', { name: 'Ver movimientos' }).first().click();
  await expect(page).toHaveURL(/variant=\d+/);

  // Sin motivo no se envía nada y se explica
  const entry = main.getByRole('form', { name: 'Registrar entrada' });
  await entry.getByLabel('Unidades que llegaron').fill('3');
  await entry.getByRole('button', { name: 'Registrar entrada' }).click();
  await expect(entry.getByText('Explique el motivo: queda anotado en el libro.')).toBeVisible();

  // Con motivo se registra y el movimiento aparece en el libro
  const reason = `Prueba de extremo a extremo ${Date.now()}`;
  await entry.getByLabel('Motivo').fill(reason);
  await entry.getByRole('button', { name: 'Registrar entrada' }).click();
  await expect(entry.getByText('Movimiento registrado.')).toBeVisible();
  await expect(main.getByText(reason)).toBeVisible();
});
