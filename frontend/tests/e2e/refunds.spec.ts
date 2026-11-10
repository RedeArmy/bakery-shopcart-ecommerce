// cspell:disable
import { expect, test } from './fixtures';

// El administrador usa la pestaña de personal que comparte toda la ejecución (fixtures.ts): no inicia sesión aquí. Navega con el
// menú, sin recargar, para no renovar la sesión.
test('the administrator reads the refunds and marks a pending one as processed with its reference', async ({
  staff: page,
}) => {
  await page.getByRole('banner').getByRole('link', { name: 'Reembolsos' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reembolsos' })).toBeVisible();
  const main = page.getByRole('main');

  // Con reembolsos pendientes o sin ellos (depende de qué escenarios corrieron antes), pero siempre a la vista y nunca en blanco
  await expect(
    main.getByRole('listitem').first().or(main.getByText('No hay reembolsos con ese estado')),
  ).toBeVisible();

  // El estado queda en la dirección y «Todos» no filtra
  await main.getByRole('button', { name: 'Todos' }).click();
  await expect(page).toHaveURL(/status=all/);
  await main.getByRole('button', { name: 'Pendientes' }).click();
  await expect(page).not.toHaveURL(/status=/);

  // Si hay uno pendiente, se procesa: sin referencia no se envía y con ella queda procesado
  const pending = main.getByRole('listitem').filter({ hasText: 'Pendiente' }).first();
  if ((await pending.count()) > 0) {
    await pending.getByRole('button', { name: 'Marcar como procesado' }).click();
    const form = pending.getByRole('form', { name: 'Marcar como procesado' });
    await form.getByRole('button', { name: 'Confirmar que se devolvió' }).click();
    await expect(form.getByText('Escriba la referencia de la transferencia.')).toBeVisible();
    const reference = `TRF-E2E-${String(Date.now())}`;
    await form.getByLabel('Referencia de la transferencia').fill(reference);
    await form.getByRole('button', { name: 'Confirmar que se devolvió' }).click();

    // Ya no está entre las pendientes y aparece entre las procesadas, con su referencia
    await main.getByRole('button', { name: 'Procesados' }).click();
    await expect(
      main.getByRole('listitem').filter({ hasText: reference }).getByText('Procesado'),
    ).toBeVisible();
  }
});
