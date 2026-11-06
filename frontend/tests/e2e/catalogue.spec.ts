// cspell:disable
import { expect, test } from '@playwright/test';

// Usan los datos de demostración (npm run up con SEED_DEMO_DATA=true): 6 categorías, 10 cupcakes, Pastel Tres Leches.

test('the home page shows the offer, the trust strip and the categories of the real catalogue', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: /Pasteles que se hornean/ }),
  ).toBeVisible();
  await expect(page.getByText('Existencias apartadas')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cupcakes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lo más nuevo' })).toBeVisible();
});

test('the catalogue filters by category, searches by text and opens a product with its variants', async ({
  page,
}) => {
  await page.goto('/catalogue');
  await expect(page.getByRole('heading', { level: 1, name: 'Catálogo' })).toBeVisible();

  // Categoría: la dirección guarda el filtro y el servidor devuelve solo esa categoría
  await page.getByRole('button', { name: 'Cupcakes' }).click();
  await expect(page).toHaveURL(/category=\d+/);
  await expect(page.getByText('10 productos')).toBeVisible();
  await expect(page.getByRole('link', { name: /Cupcakes Red Velvet/ })).toBeVisible();

  // Quitar filtros vuelve a la dirección limpia y, con ella, al catálogo completo
  await page.getByRole('button', { name: 'Quitar filtros' }).click();
  await expect(page).toHaveURL(/\/catalogue$/);

  // Búsqueda: espera a que el cliente deje de teclear y la escribe en la dirección
  await page.getByLabel('Buscar').fill('tres leches');
  await expect(page).toHaveURL(/q=tres\+leches/);
  await page.getByRole('link', { name: /Pastel Tres Leches/ }).click();

  // Producto: el precio sale tal cual del API y cambia con la variante elegida
  await expect(page.getByRole('heading', { level: 1, name: 'Pastel Tres Leches' })).toBeVisible();
  await expect(page.getByText('Q145.00')).toBeVisible();
  await page.getByText(/12 porciones/).click();
  await expect(page.getByText('Q260.00')).toBeVisible();
  await expect(page.getByText('Código PAS-3L-12')).toBeVisible();
});

test('a shared catalogue link reproduces the same search', async ({ page }) => {
  await page.goto('/catalogue?category=1&sort=price_desc&min=100');
  await expect(page.getByLabel('Ordenar por')).toHaveValue('price_desc');
  await expect(page.getByLabel('Precio desde')).toHaveValue('100.00');
  await expect(page.getByRole('button', { name: 'Pasteles' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('an address that is not a product shows the not-found view without breaking the page', async ({
  page,
}) => {
  await page.goto('/catalogue/999999');
  await expect(page.getByText('Este producto no existe')).toBeVisible();
  await page.goto('/no-such-page');
  await expect(page.getByText('Esta página no existe')).toBeVisible();
});
