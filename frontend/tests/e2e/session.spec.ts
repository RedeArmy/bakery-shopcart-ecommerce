// cspell:disable
import { expect, test } from '@playwright/test';

// El borde deja pasar 10 llamadas por minuto a /auth (ráfaga de 5): este archivo usa 4. No lo repita dentro del mismo minuto.

test('a visitor registers, keeps the session after a reload, signs out and is anonymous again', async ({
  page,
}) => {
  const stamp = Date.now();
  const email = `e2e-${stamp}@shopcart.test`;
  // Valores de prueba generados aquí: no son credenciales de nadie ni se guardan en ningún lado
  const password = `E2e-${stamp}-Aa1x`;
  const renewals: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/auth/refresh')) renewals.push(request.method());
  });

  await page.goto('/register');
  await page.getByLabel('Nombre completo').fill('Cliente E2E');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  const header = page.getByRole('banner');
  await expect(header.getByText('Cliente E2E')).toBeVisible();

  // El refresh token vive en una cookie HttpOnly: ningún script la ve y el token de acceso no se guarda en el navegador
  expect(await page.evaluate(() => document.cookie)).toBe('');
  const stored = await page.evaluate(() =>
    JSON.stringify([...Object.entries(localStorage), ...Object.entries(sessionStorage)]),
  );
  expect(stored).not.toMatch(/eyJ/);

  // Al recargar la página la sesión vuelve sola con la cookie
  renewals.length = 0;
  await page.reload();
  await expect(header.getByText('Cliente E2E')).toBeVisible();
  expect(renewals).toHaveLength(1);

  await header.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(header.getByRole('link', { name: 'Iniciar sesión' })).toBeVisible();

  // Anónimo: ya no se pide renovar al abrir la página, así no se gasta el límite del borde
  renewals.length = 0;
  await page.reload();
  await expect(header.getByRole('link', { name: 'Iniciar sesión' })).toBeVisible();
  expect(renewals).toHaveLength(0);
});

test('the sign in form explains each missing field in Spanish without calling the server', async ({
  page,
}) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/auth/')) calls.push(request.url());
  });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Iniciar sesión' }).last().click();
  await expect(page.getByText('Escriba su correo electrónico.')).toBeVisible();
  await expect(page.getByText('Escriba su contraseña.')).toBeVisible();
  expect(calls).toEqual([]);
});
