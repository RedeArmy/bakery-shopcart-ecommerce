import { expect, test } from '@playwright/test';

test('the shop answers through the edge and shows its name', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Pastelería');
});

test('the API answers through the same origin', async ({ request }) => {
  const response = await request.get('/api/v1/categories');
  expect(response.status()).toBe(200);
});
