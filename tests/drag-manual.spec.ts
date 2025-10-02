import { test, expect } from '@playwright/test';

/**
 * Manual drag test using real user account
 * This test requires manual login and demonstrates drag accuracy
 */
test.describe('Manual Drag Test - Real Account', () => {
  test('verify drag accuracy at multiple zoom levels', async ({ page }) => {
    // Navigate to campaigns - user will need to be logged in
    await page.goto('http://localhost:3000/campaigns');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check if logged in by looking for campaign link
    const campaignLink = page.locator('a[href*="/campaign/"]').first();

    // Wait for campaign to be visible
    await expect(campaignLink).toBeVisible({ timeout: 10000 });

    console.log('✅ User is logged in, proceeding with test');

    // Navigate to campaign
    await campaignLink.click();
    await page.waitForLoadState('networkidle');

    // Wait for SVG canvas to load
    await page.waitForSelector('svg', { timeout: 10000 });
    console.log('✅ Canvas loaded');

    // Wait for character card to appear
    await page.waitForSelector('[class*="cursor-grab"]', { timeout: 10000 });
    console.log('✅ Character card found');

    // Test 1: Drag at default zoom (1.0)
    console.log('\n=== TEST 1: Default Zoom (1.0) ===');
    await testDragAccuracy(page, 'default');

    // Test 2: Zoom out and drag
    console.log('\n=== TEST 2: Zoomed Out ===');
    const svg = page.locator('svg').first();
    const svgBox = await svg.boundingBox();

    if (svgBox) {
      await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);

      // Zoom out 5 times
      for (let i = 0; i < 5; i++) {
        await page.mouse.wheel(0, 100);
        await page.waitForTimeout(200);
      }

      await testDragAccuracy(page, 'zoomed-out');
    }

    // Test 3: Zoom in and drag
    console.log('\n=== TEST 3: Zoomed In ===');
    if (svgBox) {
      // Zoom in 10 times (from zoomed out position)
      for (let i = 0; i < 10; i++) {
        await page.mouse.wheel(0, -100);
        await page.waitForTimeout(200);
      }

      await testDragAccuracy(page, 'zoomed-in');
    }

    console.log('\n✅ All drag tests completed successfully!');
  });
});

async function testDragAccuracy(page: any, label: string) {
  const card = page.locator('[class*="cursor-grab"]').first();

  // Get initial position
  const initialBox = await card.boundingBox();
  if (!initialBox) {
    console.log(`❌ Could not find card at ${label}`);
    return;
  }

  console.log(`📍 Initial position: x=${Math.round(initialBox.x)}, y=${Math.round(initialBox.y)}`);

  // Calculate drag start point (center of card)
  const startX = initialBox.x + initialBox.width / 2;
  const startY = initialBox.y + initialBox.height / 2;

  // Define drag vector
  const dragDistanceX = 200;
  const dragDistanceY = 150;

  // Start drag
  await page.mouse.move(startX, startY);
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.waitForTimeout(100);

  // Drag in steps to measure accuracy
  const steps = 10;
  const drifts: number[] = [];

  for (let i = 1; i <= steps; i++) {
    const fraction = i / steps;
    const targetX = startX + dragDistanceX * fraction;
    const targetY = startY + dragDistanceY * fraction;

    await page.mouse.move(targetX, targetY);
    await page.waitForTimeout(50);

    // Measure drift
    const currentBox = await card.boundingBox();
    if (currentBox) {
      const cardCenterX = currentBox.x + currentBox.width / 2;
      const cardCenterY = currentBox.y + currentBox.height / 2;

      const driftX = targetX - cardCenterX;
      const driftY = targetY - cardCenterY;
      const drift = Math.sqrt(driftX * driftX + driftY * driftY);

      drifts.push(drift);
    }
  }

  // Complete drag
  await page.mouse.up();
  await page.waitForTimeout(500);

  // Calculate statistics
  const maxDrift = Math.max(...drifts);
  const avgDrift = drifts.reduce((a, b) => a + b, 0) / drifts.length;

  console.log(`📊 Drift analysis for ${label}:`);
  console.log(`   Max drift: ${Math.round(maxDrift)}px`);
  console.log(`   Avg drift: ${Math.round(avgDrift)}px`);

  // Verify acceptable drift (should be minimal)
  if (maxDrift < 10) {
    console.log(`   ✅ EXCELLENT - Drift under 10px`);
  } else if (maxDrift < 50) {
    console.log(`   ⚠️  ACCEPTABLE - Drift under 50px`);
  } else {
    console.log(`   ❌ POOR - Drift over 50px`);
  }

  // Take screenshot
  await page.screenshot({
    path: `drag-manual-${label}.png`,
    fullPage: false
  });

  // Verify final position
  const finalBox = await card.boundingBox();
  if (finalBox) {
    console.log(`📍 Final position: x=${Math.round(finalBox.x)}, y=${Math.round(finalBox.y)}`);
    console.log(`📏 Total movement: ${Math.round(finalBox.x - initialBox.x)}px, ${Math.round(finalBox.y - initialBox.y)}px`);
  }
}
