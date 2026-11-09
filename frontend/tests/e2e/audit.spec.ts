// cspell:disable
import { expect, test } from './fixtures';

// El administrador usa la pestaña de personal que comparte toda la ejecución (fixtures.ts): no inicia sesión aquí. Navega con el
// menú, sin recargar, para no renovar la sesión.
test('the administrator reads the audit log and filters it by module and by identifier', async ({
  staff: page,
}) => {
  await page.getByRole('banner').getByRole('link', { name: 'Bitácora' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bitácora' })).toBeVisible();

  // Con registros o sin ellos (depende de qué escenarios corrieron antes), pero siempre a la vista y nunca en blanco
  const main = page.getByRole('main');
  await expect(
    main.getByRole('listitem').first().or(main.getByText('No hay registros con esos datos')),
  ).toBeVisible();

  // El filtro por módulo queda en la dirección
  await page.getByLabel('Módulo').selectOption('Orders');
  await expect(page).toHaveURL(/module=Orders/);

  // Un identificador que no existe no trae nada y lo dice
  await page.getByLabel('Identificador').fill('no-existe-este-identificador');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page).toHaveURL(/key=no-existe-este-identificador/);
  await expect(main.getByText('No hay registros con esos datos')).toBeVisible();

  // Un rango de fechas al revés se explica sin preguntar al servidor
  await page.getByLabel('Desde').fill('2030-06-10');
  await page.getByLabel('Hasta').fill('2030-06-01');
  await expect(
    page.getByText('La fecha «Desde» no puede ser posterior a «Hasta».').first(),
  ).toBeVisible();
});
