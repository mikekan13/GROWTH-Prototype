import { test, expect } from '@playwright/test';

test.describe('Campaign Canvas Performance', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('http://localhost:3000');

    // Check if already logged in
    const isLoggedIn = await page.locator('text=Campaigns').isVisible().catch(() => false);

    if (!isLoggedIn) {
      // Look for sign in button
      const signInButton = page.locator('button:has-text("Sign In")').first();
      if (await signInButton.isVisible()) {
        await signInButton.click();
      }

      // Wait for potential redirect/login
      await page.waitForURL(/.*/, { timeout: 10000 }).catch(() => {});
    }
  });

  test('should measure canvas rendering performance', async ({ page }) => {
    // Navigate to campaigns
    await page.goto('http://localhost:3000/campaigns');
    await page.waitForLoadState('networkidle');

    // Find first campaign and navigate to it
    const campaignLink = page.locator('a[href*="/campaign/"]').first();

    if (await campaignLink.isVisible()) {
      await campaignLink.click();
      await page.waitForLoadState('networkidle');

      // Wait for canvas to load
      await page.waitForSelector('svg', { timeout: 10000 });

      // Measure initial render performance
      const metrics = await page.evaluate(() => {
        const performance = window.performance;
        const paintMetrics = performance.getEntriesByType('paint');
        return {
          firstPaint: paintMetrics.find(m => m.name === 'first-paint')?.startTime,
          firstContentfulPaint: paintMetrics.find(m => m.name === 'first-contentful-paint')?.startTime,
        };
      });

      console.log('Canvas paint metrics:', metrics);

      // Take screenshot of canvas
      await page.screenshot({ path: 'canvas-initial.png', fullPage: true });

      // Test dragging performance
      const card = page.locator('[class*="cursor-grab"]').first();

      if (await card.isVisible()) {
        console.log('Found draggable card');

        // Get card position
        const box = await card.boundingBox();

        if (box) {
          // Start performance monitoring
          const startTime = Date.now();

          // Drag the card
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();

          // Move in steps to simulate dragging
          for (let i = 0; i < 10; i++) {
            await page.mouse.move(box.x + box.width / 2 + i * 20, box.y + box.height / 2 + i * 20);
            await page.waitForTimeout(16); // ~60fps
          }

          await page.mouse.up();

          const endTime = Date.now();
          const dragDuration = endTime - startTime;

          console.log(`Drag operation took ${dragDuration}ms`);

          // Take screenshot after drag
          await page.screenshot({ path: 'canvas-after-drag.png', fullPage: true });

          // Drag should complete within reasonable time (< 500ms for 10 steps)
          expect(dragDuration).toBeLessThan(500);
        }
      }

      // Test zoom performance
      const svg = page.locator('svg').first();
      const svgBox = await svg.boundingBox();

      if (svgBox) {
        console.log('Testing zoom performance');

        // Zoom in
        await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);

        const zoomStartTime = Date.now();

        // Scroll to zoom (5 times)
        for (let i = 0; i < 5; i++) {
          await page.mouse.wheel(0, -100); // Zoom in
          await page.waitForTimeout(50);
        }

        const zoomDuration = Date.now() - zoomStartTime;
        console.log(`Zoom operation took ${zoomDuration}ms`);

        // Take screenshot at zoomed state
        await page.screenshot({ path: 'canvas-zoomed.png', fullPage: true });

        // Zoom should be smooth (< 500ms for 5 zoom steps)
        expect(zoomDuration).toBeLessThan(500);
      }

      // Check for console errors
      const consoleErrors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      // Wait a bit to catch any errors
      await page.waitForTimeout(1000);

      console.log('Console errors:', consoleErrors);

      // Log performance summary
      const finalMetrics = await page.evaluate(() => {
        return {
          memory: (performance as any).memory ? {
            usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
            totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
          } : 'not available',
        };
      });

      console.log('Final performance metrics:', finalMetrics);
    }
  });

  test('should test canvas animation smoothness', async ({ page }) => {
    // Navigate to campaign canvas
    await page.goto('http://localhost:3000/campaigns');
    await page.waitForLoadState('networkidle');

    const campaignLink = page.locator('a[href*="/campaign/"]').first();

    if (await campaignLink.isVisible()) {
      await campaignLink.click();
      await page.waitForLoadState('networkidle');

      // Wait for canvas
      await page.waitForSelector('svg', { timeout: 10000 });

      // Measure animation frame rate
      const fps = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          let frameCount = 0;
          const startTime = performance.now();

          const countFrames = () => {
            frameCount++;
            const elapsed = performance.now() - startTime;

            if (elapsed < 1000) {
              requestAnimationFrame(countFrames);
            } else {
              resolve(frameCount);
            }
          };

          requestAnimationFrame(countFrames);
        });
      });

      console.log(`Canvas animation FPS: ${fps}`);

      // Should achieve at least 30 fps (ideally 60)
      expect(fps).toBeGreaterThan(30);
    }
  });
});
