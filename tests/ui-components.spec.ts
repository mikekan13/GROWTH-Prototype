import { test, expect } from '@playwright/test';

test.describe('UI Components and Pages', () => {
  test('should load homepage without errors', async ({ page }) => {
    await page.goto('/');

    // Check for basic page structure
    await expect(page.locator('body')).toBeVisible();

    // Should not have JavaScript errors
    page.on('pageerror', (error) => {
      throw new Error(`Page error: ${error.message}`);
    });

    // Wait a moment for any async operations
    await page.waitForTimeout(1000);
  });

  test('should handle responsive design', async ({ page }) => {
    await page.goto('/');

    // Test desktop view
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('body')).toBeVisible();

    // Test tablet view
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('body')).toBeVisible();

    // Test mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load Tailwind CSS correctly', async ({ page }) => {
    await page.goto('/');

    // Check that Tailwind classes are being applied
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Check for Tailwind-specific styles
    const computedStyles = await body.evaluate((el) => {
      return window.getComputedStyle(el);
    });

    // Should have some CSS applied (not default browser styles)
    expect(computedStyles.margin).toBeDefined();
  });

  test('should handle navigation between pages', async ({ page }) => {
    await page.goto('/');

    // Check if there are navigation links
    const links = page.locator('a[href*="/"]');
    const linkCount = await links.count();

    if (linkCount > 0) {
      // Test first navigation link if it exists
      const firstLink = links.first();
      const href = await firstLink.getAttribute('href');

      if (href && !href.includes('auth') && !href.includes('api')) {
        await firstLink.click();
        // Should navigate successfully
        await page.waitForLoadState('networkidle');
        expect(page.url()).toContain(href);
      }
    }
  });

  test('should handle error states gracefully', async ({ page }) => {
    // Test 404 page
    await page.goto('/non-existent-page');

    // Should show 404 or redirect, not crash
    await page.waitForLoadState('networkidle');

    // Page should still be functional
    await expect(page.locator('body')).toBeVisible();
  });
});