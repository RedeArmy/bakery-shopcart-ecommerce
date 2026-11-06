// cspell:disable
import { expect, test } from '@playwright/test';

// Usa los datos de demostración (npm run up con SEED_DEMO_DATA=true): Pastel Tres Leches de 6 porciones a Q145.00 y el
// cupón WELCOME10 (10 % con mínimo de Q100.00). El borde deja pasar 10 llamadas por minuto a /auth: este archivo usa 2 (el registro y el inicio de sesión) y el de la sesión otros 4.

test('a visitor fills a cart, keeps it when registering and applies a coupon', async ({ page }) => {
  const stamp = Date.now();
  // Valores de prueba generados aquí: no son credenciales de nadie ni se guardan en ningún lado
  const email = `e2e-cart-${stamp}@shopcart.test`;
  const password = `E2e-${stamp}-Aa1x`;
  const header = page.getByRole('banner');

  // Como visitante: se elige el producto, una inscripción y dos unidades
  await page.goto('/catalogue');
  await page.getByLabel('Buscar').fill('tres leches');
  await page.getByRole('link', { name: /Pastel Tres Leches/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Pastel Tres Leches' })).toBeVisible();
  await page.getByLabel(/Inscripción/).fill('Feliz cumpleaños');
  await page.getByRole('button', { name: 'Una unidad más' }).click();
  await page.getByRole('button', { name: 'Agregar al carrito' }).click();
  await expect(page.getByText('Agregado al carrito.')).toBeVisible();
  await expect(header.getByRole('link', { name: 'Carrito, 2 productos' })).toBeVisible();

  // El carrito muestra los importes que calculó el servidor y el cambio de cantidad los actualiza
  await page.getByRole('link', { name: 'Ver carrito' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Su carrito' })).toBeVisible();
  await expect(page.getByText('Inscripción: Feliz cumpleaños')).toBeVisible();
  const summary = page.getByRole('complementary');
  await expect(summary.getByText('Q290.00').first()).toBeVisible();
  await page.getByRole('button', { name: 'Una unidad menos' }).click();
  await expect(summary.getByText('Q145.00').first()).toBeVisible();
  await expect(header.getByRole('link', { name: 'Carrito, 1 producto' })).toBeVisible();

  // El visitante no puede usar cupones: se le invita a ingresar y vuelve al carrito después
  await expect(summary.getByLabel('Cupón de descuento')).toHaveCount(0);
  await summary.getByRole('link', { name: 'Iniciar sesión para pagar' }).click();
  // El enlace del contenido conserva adónde iba el cliente; se espera la pantalla (carga diferida) y no el del encabezado
  await expect(page.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Nombre completo').fill('Cliente Carrito');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  // Al iniciar sesión el carrito del visitante pasa a la cuenta
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole('heading', { name: 'Pastel Tres Leches' })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Carrito, 1 producto' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('shopcart.cartToken'))).toBeNull();

  // Con sesión se puede aplicar un cupón: uno vencido explica el motivo en español y uno válido descuenta
  await page.getByLabel('Cupón de descuento').fill('EXPIRED');
  await page.getByRole('button', { name: 'Aplicar cupón' }).click();
  await expect(page.getByText('Este cupón ya venció.')).toBeVisible();
  await page.getByLabel('Cupón de descuento').fill('');
  // El descuento lo calcula la base de datos
  await page.getByLabel('Cupón de descuento').fill('WELCOME10');
  await page.getByRole('button', { name: 'Aplicar cupón' }).click();
  await expect(summary.getByText('WELCOME10')).toBeVisible();
  await expect(summary.getByText('−Q14.50')).toBeVisible();
  await expect(summary.getByText('Q130.50')).toBeVisible();
  await expect(summary.getByRole('link', { name: 'Continuar con el pago' })).toBeVisible();

  // Se quita el cupón y la línea; el carrito vuelve a estar vacío
  await summary.getByRole('button', { name: 'Quitar cupón' }).click();
  await expect(summary.getByLabel('Cupón de descuento')).toBeVisible();
  await page.getByRole('button', { name: 'Quitar Pastel Tres Leches del carrito' }).click();
  await expect(page.getByText('Su carrito está vacío')).toBeVisible();
});
