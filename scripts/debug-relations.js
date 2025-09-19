const puppeteer = require('puppeteer');

(async () => {
  console.log('🔍 Launching browser to debug Relations tab...');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();

  // Listen to console messages from the page
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('ULTRA DEBUG') || text.includes('CharacterCard render debug')) {
      console.log('🔍 Console:', text);
    }
  });

  try {
    console.log('📍 Navigating to campaign page...');
    await page.goto('http://localhost:3000/campaign/cmfjxt7fw0009uy7wjh3q5xrl', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('🎯 Clicking Relations tab...');
    await page.waitForSelector('button[onClick*="relations"]', { timeout: 10000 });
    await page.click('button[onClick*="relations"]');

    console.log('⏳ Waiting for character data to load...');
    await page.waitForTimeout(3000);

    // Check if any character cards are visible
    const characterCards = await page.$$('foreignObject');
    console.log(`📊 Found ${characterCards.length} character cards on Relations tab`);

    // Check console logs
    const logs = await page.evaluate(() => {
      return {
        characterNodes: window.__debugCharacterNodes || 'Not found',
        rawCharacters: window.__debugRawCharacters || 'Not found'
      };
    });

    console.log('📋 Debug data:', logs);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('✅ Debug complete - check console output above');
  await browser.close();
})();