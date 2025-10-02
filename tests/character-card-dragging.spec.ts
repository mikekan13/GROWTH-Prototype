import { test, expect, Page } from '@playwright/test';

test.use({ browserName: 'chromium' });

test.describe('Character Card Dragging and Persistence', () => {
  let page: Page;
  let campaignId: string;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;

    // Navigate to campaigns page (auth bypass in test mode)
    await page.goto('http://localhost:3000/campaigns', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Click first campaign by finding any link that starts with /campaign/
    const campaignLinks = await page.locator('a[href^="/campaign/"]').all();

    if (campaignLinks.length > 0) {
      console.log(`Found ${campaignLinks.length} campaigns`);
      // Click the first campaign
      await campaignLinks[0].click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Store campaign ID
      const url = page.url();
      const match = url.match(/\/campaign\/([^\/\?]+)/);
      if (match) {
        campaignId = match[1];
        console.log('Using campaign ID:', campaignId);
      }
    } else {
      console.log('No campaigns found - creating test campaign');
      // Navigate to create campaign
      await page.click('text=Create Campaign');
      await page.fill('input[name="name"]', 'Test Campaign for Dragging');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }
  });

  test('should have campaign loaded', async () => {
    // Just check that we're on a campaign page
    expect(page.url()).toContain('/campaign/');
  });

  test('should drag character card smoothly without warping', async () => {
    // Wait for character cards to load
    await page.waitForSelector('foreignObject', { timeout: 10000 });

    // Get the first character card
    const characterCard = page.locator('foreignObject').first();
    await expect(characterCard).toBeVisible();

    // Get initial position
    const initialBox = await characterCard.boundingBox();
    expect(initialBox).toBeTruthy();

    console.log('Initial position:', initialBox);

    // Drag the card
    await page.mouse.move(initialBox!.x + 50, initialBox!.y + 50);
    await page.mouse.down();

    // Drag in small increments to check for warping
    const dragSteps = 10;
    const dragDistance = 200;

    for (let i = 1; i <= dragSteps; i++) {
      await page.mouse.move(
        initialBox!.x + 50 + (dragDistance / dragSteps) * i,
        initialBox!.y + 50 + (dragDistance / dragSteps) * i,
        { steps: 5 }
      );
      await page.waitForTimeout(50);
    }

    await page.mouse.up();

    // Wait for debounce
    await page.waitForTimeout(600);

    // Get final position
    const finalBox = await characterCard.boundingBox();
    console.log('Final position:', finalBox);

    // Check that card moved approximately the right distance
    const deltaX = Math.abs((finalBox!.x - initialBox!.x) - dragDistance);
    const deltaY = Math.abs((finalBox!.y - initialBox!.y) - dragDistance);

    console.log('Delta X:', deltaX, 'Delta Y:', deltaY);

    // Allow 50px tolerance for transformations
    expect(deltaX).toBeLessThan(50);
    expect(deltaY).toBeLessThan(50);
  });

  test('should maintain position during zoom out', async () => {
    // Get character card
    const characterCard = page.locator('foreignObject').first();
    const beforeZoomBox = await characterCard.boundingBox();

    console.log('Position before zoom:', beforeZoomBox);

    // Zoom out using wheel event on the SVG
    const svg = page.locator('svg').first();
    const svgBox = await svg.boundingBox();

    // Scroll to zoom out (positive deltaY = zoom out)
    await page.mouse.move(svgBox!.x + svgBox!.width / 2, svgBox!.y + svgBox!.height / 2);

    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 100); // Zoom out
      await page.waitForTimeout(100);
    }

    // Get position after zoom
    const afterZoomBox = await characterCard.boundingBox();
    console.log('Position after zoom out:', afterZoomBox);

    // Card should still be visible (not warped to infinity)
    expect(afterZoomBox).toBeTruthy();
    expect(afterZoomBox!.x).toBeGreaterThan(-1000);
    expect(afterZoomBox!.x).toBeLessThan(10000);
    expect(afterZoomBox!.y).toBeGreaterThan(-1000);
    expect(afterZoomBox!.y).toBeLessThan(10000);
  });

  test('should drag smoothly after zooming', async () => {
    // Zoom out first
    const svg = page.locator('svg').first();
    const svgBox = await svg.boundingBox();

    await page.mouse.move(svgBox!.x + svgBox!.width / 2, svgBox!.y + svgBox!.height / 2);
    await page.mouse.wheel(0, 100); // Zoom out
    await page.waitForTimeout(200);

    // Now try to drag
    const characterCard = page.locator('foreignObject').first();
    const beforeDragBox = await characterCard.boundingBox();

    console.log('Position before drag (zoomed):', beforeDragBox);

    // Drag the card
    await page.mouse.move(beforeDragBox!.x + 50, beforeDragBox!.y + 50);
    await page.mouse.down();
    await page.mouse.move(beforeDragBox!.x + 150, beforeDragBox!.y + 150, { steps: 10 });
    await page.mouse.up();

    await page.waitForTimeout(100);

    // Get final position
    const afterDragBox = await characterCard.boundingBox();
    console.log('Position after drag (zoomed):', afterDragBox);

    // Card should have moved
    const movedX = Math.abs(afterDragBox!.x - beforeDragBox!.x);
    const movedY = Math.abs(afterDragBox!.y - beforeDragBox!.y);

    console.log('Movement X:', movedX, 'Movement Y:', movedY);

    // Should have moved at least some distance
    expect(movedX).toBeGreaterThan(20);
    expect(movedY).toBeGreaterThan(20);

    // But not teleported
    expect(movedX).toBeLessThan(500);
    expect(movedY).toBeLessThan(500);
  });

  test('should persist position after page reload', async () => {
    // Get character card initial position
    const characterCard = page.locator('foreignObject').first();

    // Drag to a specific position
    const initialBox = await characterCard.boundingBox();
    await page.mouse.move(initialBox!.x + 50, initialBox!.y + 50);
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 250, initialBox!.y + 250, { steps: 10 });
    await page.mouse.up();

    // Wait for debounce save
    await page.waitForTimeout(600);

    // Get position before reload
    const beforeReloadBox = await characterCard.boundingBox();
    console.log('Position before reload:', beforeReloadBox);

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('foreignObject', { timeout: 10000 });

    // Get position after reload
    const afterReloadCard = page.locator('foreignObject').first();
    const afterReloadBox = await afterReloadCard.boundingBox();
    console.log('Position after reload:', afterReloadBox);

    // Positions should be close (allow small tolerance for rounding)
    const deltaX = Math.abs(afterReloadBox!.x - beforeReloadBox!.x);
    const deltaY = Math.abs(afterReloadBox!.y - beforeReloadBox!.y);

    console.log('Position delta after reload - X:', deltaX, 'Y:', deltaY);

    // Should be within 10px
    expect(deltaX).toBeLessThan(10);
    expect(deltaY).toBeLessThan(10);
  });

  test('should save position to database', async () => {
    // Monitor network requests
    const saveRequests: any[] = [];

    page.on('request', request => {
      if (request.url().includes('/position') && request.method() === 'PATCH') {
        saveRequests.push({
          url: request.url(),
          body: request.postDataJSON()
        });
      }
    });

    // Drag a card
    const characterCard = page.locator('foreignObject').first();
    const initialBox = await characterCard.boundingBox();

    await page.mouse.move(initialBox!.x + 50, initialBox!.y + 50);
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 150, initialBox!.y + 150, { steps: 5 });
    await page.mouse.up();

    // Wait for debounce
    await page.waitForTimeout(600);

    // Should have made a save request
    console.log('Save requests:', saveRequests);
    expect(saveRequests.length).toBeGreaterThan(0);

    // Check request has x and y
    const lastRequest = saveRequests[saveRequests.length - 1];
    expect(lastRequest.body).toHaveProperty('x');
    expect(lastRequest.body).toHaveProperty('y');
    expect(typeof lastRequest.body.x).toBe('number');
    expect(typeof lastRequest.body.y).toBe('number');
  });
});
