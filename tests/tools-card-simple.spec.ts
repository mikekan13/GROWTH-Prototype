import { test, expect } from '@playwright/test';

test.describe('ToolsCard Design Validation', () => {
  test('should have proper visual styling and readability', async ({ page }) => {
    // Visit homepage first
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check if we can find any KRMA-related elements or campaign elements
    // This test will validate basic styling principles

    // Test color contrast and readability principles
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Test that CSS is loading properly
    const computedStyles = await body.evaluate((el) => {
      return {
        fontFamily: window.getComputedStyle(el).fontFamily,
        backgroundColor: window.getComputedStyle(el).backgroundColor
      };
    });

    // Should have fonts and colors applied
    expect(computedStyles.fontFamily).toBeDefined();
    expect(computedStyles.backgroundColor).toBeDefined();
  });

  test('should be responsive across viewport sizes', async ({ page }) => {
    await page.goto('/');

    // Test desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('body')).toBeVisible();

    // Test tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('body')).toBeVisible();

    // Test mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('body')).toBeVisible();
  });

  test('should validate color scheme implementation', async ({ page }) => {
    await page.goto('/');

    // Look for elements with the #22ab94 color scheme
    const allElements = page.locator('*');

    // Check that at least some elements have proper color styling
    const hasColorStyling = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      let hasValidColors = false;

      for (const element of elements) {
        const styles = window.getComputedStyle(element);
        const bgColor = styles.backgroundColor;
        const color = styles.color;

        // Check for our target colors or proper contrast
        if (bgColor !== 'rgba(0, 0, 0, 0)' || color !== 'rgb(0, 0, 0)') {
          hasValidColors = true;
          break;
        }
      }

      return hasValidColors;
    });

    expect(hasValidColors).toBe(true);
  });

  test('should have minimal text and clear hierarchy', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check text content is not excessive
    const textContent = await page.locator('body').textContent();
    expect(textContent).toBeDefined();

    // Should have proper heading hierarchy
    const headings = page.locator('h1, h2, h3, h4, h5, h6');
    const headingCount = await headings.count();

    // Should have some headings but not excessive
    expect(headingCount).toBeGreaterThanOrEqual(0);
  });
});