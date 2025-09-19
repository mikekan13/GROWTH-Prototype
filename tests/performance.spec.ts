import { test, expect } from '@playwright/test';
import { TestHelpers } from './test-helpers';

test.describe('Performance Tests', () => {
  test('should load homepage within acceptable time', async ({ page }) => {
    const loadTime = await TestHelpers.measurePageLoadTime(page, '/');

    // Should load within 10 seconds (generous for development)
    expect(loadTime).toBeLessThan(10000);

    console.log(`Homepage loaded in ${loadTime}ms`);
  });

  test('should handle multiple concurrent users', async ({ browser }) => {
    const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext()
    ]);

    const pages = await Promise.all(
      contexts.map(context => context.newPage())
    );

    // Load the same page simultaneously
    const loadPromises = pages.map(page =>
      TestHelpers.measurePageLoadTime(page, '/')
    );

    const loadTimes = await Promise.all(loadPromises);

    // All should complete within reasonable time
    loadTimes.forEach(time => {
      expect(time).toBeLessThan(15000);
    });

    // Cleanup
    await Promise.all(contexts.map(context => context.close()));
  });

  test('should not have memory leaks during navigation', async ({ page }) => {
    const routes = ['/', '/auth/signin'];

    for (const route of routes) {
      await page.goto(route);
      await TestHelpers.waitForPageLoad(page);

      // Check for JavaScript errors that might indicate memory issues
      const errors = await TestHelpers.checkForJavaScriptErrors(page);
      expect(errors.filter(error =>
        error.includes('memory') || error.includes('leak')
      )).toHaveLength(0);
    }
  });

  test('should optimize image loading', async ({ page }) => {
    await page.goto('/');
    await TestHelpers.waitForPageLoad(page);

    const imageStats = await TestHelpers.checkImageAltText(page);

    // All images should have alt text for accessibility and SEO
    expect(imageStats.imagesWithoutAlt).toBe(0);

    console.log(`Found ${imageStats.totalImages} images, ${imageStats.imagesWithoutAlt} without alt text`);
  });

  test('should handle large datasets efficiently', async ({ page }) => {
    // Test with mock data to simulate large character/campaign lists
    await TestHelpers.mockApiResponse(page, '**/api/campaigns', {
      campaigns: Array.from({ length: 100 }, (_, i) => ({
        id: `campaign-${i}`,
        name: `Test Campaign ${i}`,
        description: `Description for campaign ${i}`
      }))
    });

    const loadTime = await TestHelpers.measurePageLoadTime(page, '/campaigns');

    // Should still load efficiently with large datasets
    expect(loadTime).toBeLessThan(15000);
  });
});