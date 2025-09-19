const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    // Navigate to create character page
    await page.goto('http://localhost:3000/trailblazer/create-character');
    await page.waitForLoadState('networkidle');

    // Take screenshot of create character page
    await page.screenshot({
      path: 'screenshot-create-character.png',
      fullPage: true
    });
    console.log('✓ Screenshot saved: screenshot-create-character.png');

    // Navigate to trailblazer dashboard
    await page.goto('http://localhost:3000/trailblazer');
    await page.waitForLoadState('networkidle');

    // Take screenshot of trailblazer dashboard
    await page.screenshot({
      path: 'screenshot-trailblazer-dashboard.png',
      fullPage: true
    });
    console.log('✓ Screenshot saved: screenshot-trailblazer-dashboard.png');

  } catch (error) {
    console.log('Error taking screenshots:', error.message);
    console.log('Make sure the server is running on localhost:3000');
  } finally {
    await browser.close();
  }
})();