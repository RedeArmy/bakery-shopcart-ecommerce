// cspell:disable
import { expect, test } from './fixtures';

// El administrador usa la pestaña de personal que comparte toda la ejecución (fixtures.ts): no inicia sesión aquí. Navega con el
// menú, sin recargar, para no renovar la sesión.
test('the administrator sees the coupons, creates one, edits it and deactivates it', async ({
  staff: page,
}) => {
  await page.getByRole('banner').getByRole('link', { name: 'Cupones' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cupones' })).toBeVisible();
  const main = page.getByRole('main');

  // Los cupones de demostración ya están, cada uno con su estado
  await expect(main.getByText('WELCOME10')).toBeVisible();
  await expect(main.getByText('Vigente').first()).toBeVisible();

  // Sin lo obligatorio no se crea nada y se explica
  await main.getByRole('button', { name: 'Nuevo cupón' }).click();
  const form = main.getByRole('form', { name: 'Nuevo cupón' });
  await form.getByRole('button', { name: 'Crear cupón' }).click();
  await expect(form.getByText(/Use de 3 a 30 letras/)).toBeVisible();

  // Con todo en regla se crea y aparece vigente. Un código por ejecución: no se repite.
  const code = `E2E${String(Date.now())}`;
  await form.getByLabel('Código').fill(code);
  await form.getByLabel('Valor').fill('15');
  // Empieza ayer, para que ya esté vigente (un día de margen por la diferencia entre UTC y Guatemala)
  const yesterday = new Date(Date.now() - 24 * 3_600_000).toISOString().slice(0, 10);
  await form.getByLabel('Primer día').fill(yesterday);
  await form.getByLabel('Último día').fill('2030-12-31');
  await form.getByLabel(/^Usos por cliente/).fill('1');
  await form.getByRole('button', { name: 'Crear cupón' }).click();
  const card = main.getByRole('listitem').filter({ hasText: code });
  await expect(card).toBeVisible();
  await expect(card.getByText('15 % de descuento')).toBeVisible();
  await expect(card.getByText('Vigente')).toBeVisible();

  // Se edita: cambia el valor y el código no se puede tocar
  await card.getByRole('button', { name: 'Editar' }).click();
  const edit = main.getByRole('form', { name: 'Editar cupón' });
  await expect(edit.getByLabel('Código')).toHaveCount(0);
  await edit.getByLabel('Valor').fill('20');
  await edit.getByRole('button', { name: 'Guardar cambios' }).click();
  // Primero se espera a que el formulario se cierre: si el servidor lo rechaza, queda abierto con su motivo y la prueba lo dice
  await expect(edit).toBeHidden();
  await expect(card.getByText('20 % de descuento')).toBeVisible();

  // Se desactiva con confirmación: en «Todos» sigue en la lista, marcado como desactivado, con «Activar» y «Eliminar»
  await card.getByRole('button', { name: 'Desactivar' }).click();
  await card.getByRole('button', { name: 'Sí, desactivarlo' }).click();
  await expect(card.getByText('Desactivado')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Editar' })).toHaveCount(0);

  // Se vuelve a activar de un clic y recupera sus acciones
  await card.getByRole('button', { name: 'Activar' }).click();
  await expect(card.getByText('Vigente')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Eliminar' })).toHaveCount(0);

  // Desactivado otra vez, aparece en «Desactivados» y no en «Vigentes»
  await card.getByRole('button', { name: 'Desactivar' }).click();
  await card.getByRole('button', { name: 'Sí, desactivarlo' }).click();
  await main.getByRole('button', { name: 'Vigentes' }).click();
  await expect(page).toHaveURL(/status=active/);
  await expect(main.getByRole('listitem').filter({ hasText: code })).toHaveCount(0);
  await main.getByRole('button', { name: 'Desactivados' }).click();
  await expect(page).toHaveURL(/status=inactive/);
  await expect(card).toBeVisible();

  // Ningún pedido lo usó: se elimina por completo, con confirmación, y ya no está en ninguna lista
  await card.getByRole('button', { name: 'Eliminar' }).click();
  await card.getByRole('button', { name: 'Sí, eliminarlo' }).click();
  await expect(card).toHaveCount(0);
  await main.getByRole('button', { name: 'Todos' }).click();
  await expect(main.getByRole('listitem').first()).toBeVisible();
  await expect(main.getByRole('listitem').filter({ hasText: code })).toHaveCount(0);
});
