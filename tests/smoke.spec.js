import { expect, test } from '@playwright/test';

test('loads the PSN Manager portal', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/PSN Manager/i);
  await expect(page.getByText('PSN Manager').first()).toBeVisible();
});
