// cspell:disable
import { expect, test } from './fixtures';

// El administrador usa la pestaña de personal que comparte toda la ejecución (fixtures.ts): no inicia sesión aquí. Navega con el
// menú, sin recargar, para no renovar la sesión.
test('the administrator opens the dashboard from the menu, reads the reports and picks a period', async ({
  staff: page,
}) => {
  await page.getByRole('banner').getByRole('link', { name: 'Panel', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Hola / })).toBeVisible();

  // El personal no compra: sin tienda, sin carrito y sin el aviso de los pasteles por encargo
  const header = page.getByRole('banner');
  await expect(header.getByRole('link', { name: 'Catálogo' })).toHaveCount(0);
  await expect(header.getByRole('link', { name: /Carrito/ })).toHaveCount(0);
  await expect(page.getByText(/Pasteles por encargo: cada producto indica/)).toHaveCount(0);

  // Cada reporte resuelve su estado: con datos o vacío, pero siempre a la vista
  for (const name of [
    'Resumen del período',
    'Ventas por período',
    'Ventas por categoría',
    'Los 10 productos más vendidos',
  ]) {
    await expect(page.getByRole('region', { name })).toBeVisible();
  }

  // El período se elige con un clic y queda en la dirección
  const preset = page.getByRole('button', { name: 'Últimos 7 días' });
  await preset.click();
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}/);
  await expect(preset).toHaveAttribute('aria-pressed', 'true');

  // Agrupar por mes cambia lo que se pide al servidor y se ve en la dirección
  await page.getByLabel('Agrupar por').selectOption('month');
  await expect(page).toHaveURL(/granularity=month/);
  await expect(page.getByRole('region', { name: 'Ventas por período' })).toBeVisible();

  // Un período al revés se explica sin preguntar al servidor
  await page.getByLabel('Desde').fill('2030-06-10');
  await page.getByLabel('Hasta').fill('2030-06-01');
  await expect(
    page.getByText('La fecha «Desde» no puede ser posterior a «Hasta».').first(),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ventas por período' })).toHaveCount(0);

  // Restablecer vuelve a los últimos 30 días del servidor
  await page.getByRole('button', { name: 'Restablecer' }).click();
  await expect(page).not.toHaveURL(/from=/);
  await expect(page.getByRole('region', { name: 'Resumen del período' })).toBeVisible();
});
