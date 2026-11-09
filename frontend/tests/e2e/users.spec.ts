// cspell:disable
import { expect, test } from './fixtures';

// El administrador usa la pestaña de personal que comparte toda la ejecución (fixtures.ts): no inicia sesión aquí. Navega con el
// menú, sin recargar, para no renovar la sesión.
test('the administrator finds the accounts, filters them by role and cannot deactivate their own', async ({
  staff: page,
}) => {
  await page.getByRole('banner').getByRole('link', { name: 'Usuarios' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeVisible();

  // La semilla trae al menos la cuenta del administrador: la lista nunca está vacía
  const main = page.getByRole('main');
  await expect(main.getByRole('listitem').first()).toBeVisible();

  // Su propia cuenta lleva el aviso y no ofrece desactivarla
  const own = main.getByRole('listitem').filter({ hasText: 'no se puede desactivar' });
  await expect(own).toHaveCount(1);
  await expect(own.getByRole('button')).toHaveCount(0);

  // El filtro por rol queda en la dirección y solo deja cuentas de ese rol
  await page.getByLabel('Rol').selectOption('Administrador');
  await expect(page).toHaveURL(/role=3/);
  await expect(main.getByRole('listitem').first()).toBeVisible();
  await expect(main.getByRole('listitem').getByText('Cliente', { exact: true })).toHaveCount(0);

  // Un texto que no coincide con nadie no trae nada y lo dice
  await page.getByLabel('Buscar usuario').fill('nadie-se-llama-asi');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page).toHaveURL(/q=nadie-se-llama-asi/);
  await expect(main.getByText('No hay cuentas con esos datos')).toBeVisible();
});
