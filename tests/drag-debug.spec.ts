import { test, expect } from '@playwright/test';

test.describe('Drag Debug - Visual Analysis', () => {
  test('record drag behavior at different zoom levels', async ({ page }) => {
    // Navigate to campaign
    await page.goto('http://localhost:3000/campaigns');
    await page.waitForLoadState('networkidle');

    const campaignLink = page.locator('a[href*="/campaign/"]').first();
    if (await campaignLink.isVisible()) {
      await campaignLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('svg', { timeout: 10000 });

      // Wait for character card to load
      await page.waitForTimeout(2000);

      console.log('=== ZOOM LEVEL 1.0 (Default) ===');
      await testDragAtCurrentZoom(page, '1.0');

      // Zoom out
      console.log('\n=== ZOOM OUT (3 times) ===');
      const svg = page.locator('svg').first();
      const svgBox = await svg.boundingBox();

      if (svgBox) {
        await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);

        for (let i = 0; i < 3; i++) {
          await page.mouse.wheel(0, 100); // Zoom out
          await page.waitForTimeout(200);
        }

        await testDragAtCurrentZoom(page, 'Zoomed Out');
      }

      // Zoom in
      console.log('\n=== ZOOM IN (6 times) ===');
      if (svgBox) {
        for (let i = 0; i < 6; i++) {
          await page.mouse.wheel(0, -100); // Zoom in
          await page.waitForTimeout(200);
        }

        await testDragAtCurrentZoom(page, 'Zoomed In');
      }
    }
  });
});

async function testDragAtCurrentZoom(page: any, zoomLabel: string) {
  const card = page.locator('[class*="cursor-grab"]').first();

  if (!(await card.isVisible())) {
    console.log(`Card not visible at ${zoomLabel}`);
    return;
  }

  const box = await card.boundingBox();
  if (!box) {
    console.log(`No bounding box at ${zoomLabel}`);
    return;
  }

  console.log(`Card position before drag: x=${box.x}, y=${box.y}`);

  // Start drag
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();

  // Record positions during drag
  const dragPoints = [];
  const dragDistance = 200;
  const steps = 10;

  for (let i = 1; i <= steps; i++) {
    const targetX = startX + (dragDistance / steps) * i;
    const targetY = startY + (dragDistance / steps) * i;

    await page.mouse.move(targetX, targetY);
    await page.waitForTimeout(50);

    const currentBox = await card.boundingBox();
    if (currentBox) {
      const cardCenterX = currentBox.x + currentBox.width / 2;
      const cardCenterY = currentBox.y + currentBox.height / 2;

      const drift = Math.sqrt(
        Math.pow(targetX - cardCenterX, 2) +
        Math.pow(targetY - cardCenterY, 2)
      );

      dragPoints.push({
        step: i,
        mouseX: targetX,
        mouseY: targetY,
        cardCenterX,
        cardCenterY,
        drift: Math.round(drift)
      });
    }
  }

  await page.mouse.up();
  await page.waitForTimeout(500);

  // Analyze drift
  console.log('\nDrag Analysis:');
  console.log('Step | Mouse Pos    | Card Center  | Drift (px)');
  console.log('-----|--------------|--------------|------------');
  dragPoints.forEach(p => {
    console.log(
      `${String(p.step).padStart(4)} | ` +
      `${Math.round(p.mouseX)},${Math.round(p.mouseY)}`.padEnd(12) + ` | ` +
      `${Math.round(p.cardCenterX)},${Math.round(p.cardCenterY)}`.padEnd(12) + ` | ` +
      `${p.drift}`
    );
  });

  const maxDrift = Math.max(...dragPoints.map(p => p.drift));
  const avgDrift = dragPoints.reduce((sum, p) => sum + p.drift, 0) / dragPoints.length;

  console.log(`\nMax Drift: ${maxDrift}px`);
  console.log(`Avg Drift: ${Math.round(avgDrift)}px`);

  // Take screenshot after drag
  await page.screenshot({
    path: `drag-test-${zoomLabel.replace(/\s+/g, '-')}.png`,
    fullPage: false
  });
}
