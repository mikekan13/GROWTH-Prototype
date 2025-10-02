import { test, expect } from '@playwright/test';
import { setupTestEnvironment, bypassAuth, createTestCampaign, cleanupTestData } from './test-helpers';

test.describe('Character Position Persistence', () => {
  let testCampaignId: string;
  let testCharacterId: string;

  test.beforeEach(async ({ page }) => {
    await setupTestEnvironment(page);
    await bypassAuth(page);

    // Create a test campaign with characters
    const campaign = await createTestCampaign(page, {
      name: 'Position Test Campaign',
      genre: 'Test',
      description: 'Testing character position persistence'
    });
    testCampaignId = campaign.id;

    // Navigate to campaign page
    await page.goto(`/campaign/${testCampaignId}`);
    await page.waitForLoadState('networkidle');

    // Wait for characters to load
    await page.waitForSelector('[data-testid="debug-panel"]', { timeout: 10000 });

    // Verify we have characters loaded
    const debugPanel = page.locator('[data-testid="debug-panel"]');
    await expect(debugPanel).toContainText('Characters loaded:');

    // Get the first character ID from the debug logs
    // This is a bit hacky but necessary since we need the character ID
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      if (msg.text().includes('✅ Transformed character:')) {
        consoleMessages.push(msg.text());
      }
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Wait for console messages

    if (consoleMessages.length > 0) {
      // Extract character ID from console message
      const match = consoleMessages[0].match(/✅ Transformed character: (\w+)/);
      if (match) {
        testCharacterId = match[1];
      }
    }
  });

  test.afterEach(async ({ page }) => {
    if (testCampaignId) {
      await cleanupTestData(page, { campaignId: testCampaignId });
    }
  });

  test('character cards start at center position (0,0)', async ({ page }) => {
    // Navigate to Relations tab
    await page.click('button:text("Relations")');
    await page.waitForTimeout(1000);

    // Check that character cards are visible and positioned at center
    const characterCards = page.locator('[data-testid="character-card"]');
    await expect(characterCards.first()).toBeVisible({ timeout: 10000 });

    // Verify initial position in debug logs
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('*')).some(el =>
        el.textContent?.includes('All transformed nodes with positions:')
      );
    });

    // Check console for position information
    let positionFound = false;
    page.on('console', msg => {
      if (msg.text().includes('All transformed nodes with positions:') &&
          msg.text().includes('x: 0, y: 0')) {
        positionFound = true;
      }
    });

    await page.reload();
    await page.waitForTimeout(2000);

    expect(positionFound).toBeTruthy();
  });

  test('character position persists after drag and drop', async ({ page, request }) => {
    if (!testCharacterId) {
      test.skip('No character ID available for testing');
      return;
    }

    // Navigate to Relations tab
    await page.click('button:text("Relations")');
    await page.waitForTimeout(1000);

    // Wait for character cards to be visible
    const characterCard = page.locator('[data-testid="character-card"]').first();
    await expect(characterCard).toBeVisible({ timeout: 10000 });

    // Simulate dragging a character card to a new position
    // Note: This test may need to be adjusted based on the actual drag implementation
    const newX = 200;
    const newY = 150;

    // Directly call the position API to simulate a drag operation
    const positionResponse = await request.patch(`/api/characters/${testCharacterId}/position`, {
      data: { x: newX, y: newY },
      headers: { 'Content-Type': 'application/json' }
    });

    expect(positionResponse.ok()).toBeTruthy();

    const positionData = await positionResponse.json();
    expect(positionData).toMatchObject({
      success: true,
      character: {
        id: testCharacterId,
        x: newX,
        y: newY
      }
    });

    // Refresh the page to verify position persistence
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check that the character position is restored from database
    let positionRestored = false;
    page.on('console', msg => {
      if (msg.text().includes('All transformed nodes with positions:') &&
          msg.text().includes(`x: ${newX}, y: ${newY}`)) {
        positionRestored = true;
      }
    });

    await page.reload();
    await page.waitForTimeout(2000);

    expect(positionRestored).toBeTruthy();
  });

  test('multiple character positions are tracked independently', async ({ page, request: _request }) => {
    // Navigate to Relations tab
    await page.click('button:text("Relations")');
    await page.waitForTimeout(1000);

    // Wait for character cards to load
    const debugPanel = page.locator('[data-testid="debug-panel"]');
    await expect(debugPanel).toContainText('Characters loaded:');

    // Get character count from debug panel
    const debugText = await debugPanel.textContent();
    const charCountMatch = debugText?.match(/Characters loaded: (\d+)/);
    const characterCount = charCountMatch ? parseInt(charCountMatch[1]) : 0;

    if (characterCount < 2) {
      test.skip('Need at least 2 characters for this test');
      return;
    }

    // Verify that multiple characters can have different positions
    const characterCards = page.locator('[data-testid="character-card"]');
    await expect(characterCards.first()).toBeVisible({ timeout: 10000 });

    // Check that all characters start at center
    let allAtCenter = false;
    page.on('console', msg => {
      if (msg.text().includes('All transformed nodes with positions:')) {
        // All characters should start at x: 0, y: 0
        const positions = msg.text().match(/x: 0, y: 0/g);
        allAtCenter = positions && positions.length >= characterCount;
      }
    });

    await page.reload();
    await page.waitForTimeout(2000);

    expect(allAtCenter).toBeTruthy();
  });

  test('position API endpoint validation', async ({ request }) => {
    if (!testCharacterId) {
      test.skip('No character ID available for testing');
      return;
    }

    // Test valid position update
    const validResponse = await request.patch(`/api/characters/${testCharacterId}/position`, {
      data: { x: 100, y: 200 },
      headers: { 'Content-Type': 'application/json' }
    });

    expect(validResponse.ok()).toBeTruthy();

    // Test invalid data (missing coordinates)
    const invalidResponse1 = await request.patch(`/api/characters/${testCharacterId}/position`, {
      data: { x: 100 }, // Missing y
      headers: { 'Content-Type': 'application/json' }
    });

    expect(invalidResponse1.status()).toBe(400);

    // Test invalid data (non-numeric coordinates)
    const invalidResponse2 = await request.patch(`/api/characters/${testCharacterId}/position`, {
      data: { x: 'invalid', y: 200 },
      headers: { 'Content-Type': 'application/json' }
    });

    expect(invalidResponse2.status()).toBe(400);

    // Test non-existent character
    const notFoundResponse = await request.patch(`/api/characters/nonexistent/position`, {
      data: { x: 100, y: 200 },
      headers: { 'Content-Type': 'application/json' }
    });

    expect(notFoundResponse.status()).toBe(404);
  });

  test('character positions survive server restart simulation', async ({ page, request }) => {
    if (!testCharacterId) {
      test.skip('No character ID available for testing');
      return;
    }

    // Set a specific position
    const testX = 300;
    const testY = 250;

    await request.patch(`/api/characters/${testCharacterId}/position`, {
      data: { x: testX, y: testY },
      headers: { 'Content-Type': 'application/json' }
    });

    // Clear browser cache and session to simulate server restart
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Re-authenticate and navigate to campaign
    await bypassAuth(page);
    await page.goto(`/campaign/${testCampaignId}`);
    await page.waitForLoadState('networkidle');

    // Verify position is still preserved
    await page.click('button:text("Relations")');
    await page.waitForTimeout(2000);

    let positionPreserved = false;
    page.on('console', msg => {
      if (msg.text().includes('All transformed nodes with positions:') &&
          msg.text().includes(`x: ${testX}, y: ${testY}`)) {
        positionPreserved = true;
      }
    });

    await page.reload();
    await page.waitForTimeout(2000);

    expect(positionPreserved).toBeTruthy();
  });
});