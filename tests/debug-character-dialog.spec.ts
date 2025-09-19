import { test, expect } from '@playwright/test';
import { authenticateTestUser, cleanupTestData } from './test-helpers';

test.describe('Debug Character Creation Dialog', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as WATCHER to access tools
    await authenticateTestUser(page, 'WATCHER');
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestData(page);
  });

  test('should find and test character creation dialog', async ({ page }) => {
    console.log('🔍 Starting character creation dialog investigation...');

    // Try different potential pages where ToolsCard might be
    const pagesToCheck = [
      '/campaigns',
      '/trailblazer',
      '/campaign/1',
      '/campaign/test'
    ];

    let toolsCardFound = false;
    let successfulPage = '';

    for (const pagePath of pagesToCheck) {
      console.log(`🔍 Checking page: ${pagePath}`);

      try {
        await page.goto(pagePath);
        await page.waitForLoadState('networkidle', { timeout: 5000 });

        // Look for tools card
        const toolsCard = page.locator('[data-testid="tools-card"]');
        const toolsCardVisible = await toolsCard.isVisible({ timeout: 3000 });

        if (toolsCardVisible) {
          console.log(`✅ Found ToolsCard on page: ${pagePath}`);
          toolsCardFound = true;
          successfulPage = pagePath;
          break;
        } else {
          console.log(`❌ No ToolsCard found on: ${pagePath}`);
        }

        // Take screenshot of each page for debugging
        await page.screenshot({
          path: `test-results/debug-page-${pagePath.replace(/\//g, '_')}.png`,
          fullPage: true
        });

      } catch (error) {
        console.log(`⚠️ Error checking ${pagePath}:`, error);
      }
    }

    if (!toolsCardFound) {
      console.log('🔍 ToolsCard not found on standard pages, checking for any create character buttons...');

      await page.goto('/campaigns');
      await page.waitForLoadState('networkidle');

      // Look for any create character buttons or links
      const createButtons = await page.locator('button, a').filter({ hasText: /create.*character/i }).all();
      console.log(`Found ${createButtons.length} potential create character buttons`);

      for (let i = 0; i < createButtons.length; i++) {
        const buttonText = await createButtons[i].textContent();
        console.log(`Button ${i}: "${buttonText}"`);
      }

      // Check if there are any modals or dialogs already on the page
      const existingModals = await page.locator('[data-testid*="modal"], .modal, .dialog').all();
      console.log(`Found ${existingModals.length} existing modal elements`);

      // Take comprehensive screenshot
      await page.screenshot({
        path: 'test-results/debug-no-tools-card.png',
        fullPage: true
      });

      // Log page content for debugging
      const pageContent = await page.content();
      console.log('Page content includes ToolsCard:', pageContent.includes('ToolsCard'));
      console.log('Page content includes data-testid="tools-card":', pageContent.includes('data-testid="tools-card"'));
    } else {
      console.log(`🎯 Testing character creation dialog on: ${successfulPage}`);

      // Navigate back to successful page
      await page.goto(successfulPage);
      await page.waitForLoadState('networkidle');

      const toolsCard = page.locator('[data-testid="tools-card"]');
      await expect(toolsCard).toBeVisible();

      // Take screenshot of tools card
      await toolsCard.screenshot({
        path: 'test-results/debug-tools-card.png'
      });

      // Find and click the create character button
      const createButton = page.locator('[data-testid="create-character-btn"]');
      await expect(createButton).toBeVisible();

      console.log('🔍 Create button found, clicking...');
      await createButton.click({ force: true });

      // Wait for modal
      const modal = page.locator('[data-testid="character-modal"]');
      await expect(modal).toBeVisible({ timeout: 10000 });

      console.log('✅ Modal appeared, taking screenshots...');

      // Take screenshot of modal
      await page.screenshot({
        path: 'test-results/debug-character-modal.png',
        fullPage: false
      });

      // Analyze modal styling
      const modalAnalysis = await page.evaluate(() => {
        const modal = document.querySelector('[data-testid="character-modal"]');
        if (!modal) return null;

        const modalParent = modal.closest('.fixed, [style*="position: fixed"]');

        return {
          modal: {
            exists: !!modal,
            className: modal.className,
            computedStyles: {
              backgroundColor: window.getComputedStyle(modal).backgroundColor,
              background: window.getComputedStyle(modal).background,
              borderRadius: window.getComputedStyle(modal).borderRadius,
              boxShadow: window.getComputedStyle(modal).boxShadow,
              backdropFilter: window.getComputedStyle(modal).backdropFilter
            }
          },
          modalParent: modalParent ? {
            className: modalParent.className,
            computedStyles: {
              backgroundColor: window.getComputedStyle(modalParent).backgroundColor,
              backdropFilter: window.getComputedStyle(modalParent).backdropFilter
            }
          } : null
        };
      });

      console.log('🔍 Modal Analysis:', JSON.stringify(modalAnalysis, null, 2));

      // Test form interaction
      const nameInput = modal.locator('#characterName');
      await expect(nameInput).toBeVisible();

      await nameInput.fill('Debug Test Character');

      // Take screenshot with filled form
      await page.screenshot({
        path: 'test-results/debug-character-modal-filled.png',
        fullPage: false
      });

      console.log('✅ Modal investigation complete!');
    }
  });
});