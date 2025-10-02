import { test, expect } from '@playwright/test';
import { authenticateTestUser, cleanupTestData } from './test-helpers';

test.describe('Character Creation Dialog - Visual Design Analysis', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as WATCHER to access campaign tools
    await authenticateTestUser(page, 'WATCHER');
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestData(page);
  });

  test('should display tools card and analyze current modal design', async ({ page }) => {
    // Navigate to campaigns page where ToolsCard is likely displayed
    await page.goto('/campaigns');

    // Look for the tools card
    const toolsCard = page.locator('[data-testid="tools-card"]');
    await expect(toolsCard).toBeVisible();

    // Take screenshot of initial state
    await page.screenshot({
      path: 'test-results/tools-card-initial.png',
      fullPage: false,
      clip: { x: 0, y: 0, width: 1200, height: 800 }
    });

    // Click the create character button
    const createButton = page.locator('[data-testid="create-character-btn"]');
    await expect(createButton).toBeVisible();
    await expect(createButton).toContainText('CREATE');

    await createButton.click();

    // Verify modal appears
    const modal = page.locator('[data-testid="character-modal"]');
    await expect(modal).toBeVisible();

    // Take screenshot of modal
    await page.screenshot({
      path: 'test-results/character-modal-current.png',
      fullPage: false
    });

    // Analyze current modal structure
    const modalTitle = modal.locator('h3');
    await expect(modalTitle).toContainText('Create New Character');

    // Check form elements
    const nameInput = modal.locator('#characterName');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveAttribute('placeholder', 'Enter character name...');

    const cancelButton = modal.locator('button:has-text("Cancel")');
    const createCharacterButton = modal.locator('button:has-text("Create Character")');

    await expect(cancelButton).toBeVisible();
    await expect(createCharacterButton).toBeVisible();
    await expect(createCharacterButton).toBeDisabled(); // Should be disabled when no name

    // Test form interaction
    await nameInput.fill('Test Character');
    await expect(createCharacterButton).toBeEnabled();

    // Take screenshot with filled form
    await page.screenshot({
      path: 'test-results/character-modal-filled.png',
      fullPage: false
    });

    // Test cancel functionality
    await cancelButton.click();
    await expect(modal).not.toBeVisible();
  });

  test('should analyze modal styling and structure for redesign', async ({ page }) => {
    await page.goto('/campaigns');

    // Open modal
    await page.locator('[data-testid="create-character-btn"]').click();
    const modal = page.locator('[data-testid="character-modal"]');
    await expect(modal).toBeVisible();

    // Get computed styles of modal elements
    const modalStyles = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="character-modal"]');
      if (!modal) return null;

      const parentModal = modal.closest('.fixed');
      const contentDiv = modal.querySelector('.bg-white');
      const title = modal.querySelector('h3');
      const input = modal.querySelector('#characterName');
      const buttons = Array.from(modal.querySelectorAll('button'));

      return {
        parentModal: parentModal ? window.getComputedStyle(parentModal) : null,
        contentDiv: contentDiv ? {
          className: contentDiv.className,
          style: window.getComputedStyle(contentDiv)
        } : null,
        title: title ? {
          className: title.className,
          style: window.getComputedStyle(title)
        } : null,
        input: input ? {
          className: input.className,
          style: window.getComputedStyle(input)
        } : null,
        buttons: buttons.map(btn => ({
          text: btn.textContent?.trim(),
          className: btn.className,
          style: window.getComputedStyle(btn)
        }))
      };
    });

    console.log('Current Modal Styles:', JSON.stringify(modalStyles, null, 2));

    // Measure modal dimensions
    const modalBox = await modal.boundingBox();
    console.log('Modal Dimensions:', modalBox);

    // Check if modal matches tools card design theme
    const _toolsCard = page.locator('[data-testid="tools-card"]');
    const toolsCardStyles = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="tools-card"]');
      return card ? {
        className: card.className,
        style: window.getComputedStyle(card)
      } : null;
    });

    console.log('Tools Card Styles:', JSON.stringify(toolsCardStyles, null, 2));
  });

  test('should test modal responsiveness and accessibility', async ({ page }) => {
    await page.goto('/campaigns');

    // Test different viewport sizes
    const viewports = [
      { width: 1920, height: 1080, name: 'desktop' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 375, height: 667, name: 'mobile' }
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);

      // Open modal
      await page.locator('[data-testid="create-character-btn"]').click();
      const modal = page.locator('[data-testid="character-modal"]');
      await expect(modal).toBeVisible();

      // Take screenshot for each viewport
      await page.screenshot({
        path: `test-results/character-modal-${viewport.name}.png`,
        fullPage: false
      });

      // Check if modal is properly positioned and sized
      const modalBox = await modal.boundingBox();
      console.log(`Modal on ${viewport.name}:`, modalBox);

      // Test keyboard navigation
      await page.keyboard.press('Tab'); // Should focus name input
      await page.keyboard.type('Responsive Test');
      await page.keyboard.press('Tab'); // Should focus create button
      await page.keyboard.press('Tab'); // Should focus cancel button

      // Close modal and continue
      await page.keyboard.press('Escape');
      await expect(modal).not.toBeVisible();
    }
  });

  test('should analyze color scheme and theme consistency', async ({ page }) => {
    await page.goto('/campaigns');

    // Get tools card color scheme
    const toolsCardColors = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="tools-card"]');
      if (!card) return null;

      const styles = window.getComputedStyle(card);
      return {
        backgroundColor: styles.backgroundColor,
        background: styles.background,
        borderColor: styles.borderColor,
        boxShadow: styles.boxShadow,
        color: styles.color
      };
    });

    console.log('Tools Card Color Scheme:', toolsCardColors);

    // Open modal and get its colors
    await page.locator('[data-testid="create-character-btn"]').click();
    const modal = page.locator('[data-testid="character-modal"]');
    await expect(modal).toBeVisible();

    const modalColors = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="character-modal"]');
      if (!modal) return null;

      const contentDiv = modal.querySelector('.bg-white');
      const title = modal.querySelector('h3');
      const input = modal.querySelector('#characterName');

      return {
        contentDiv: contentDiv ? {
          backgroundColor: window.getComputedStyle(contentDiv).backgroundColor,
          boxShadow: window.getComputedStyle(contentDiv).boxShadow
        } : null,
        title: title ? {
          color: window.getComputedStyle(title).color
        } : null,
        input: input ? {
          backgroundColor: window.getComputedStyle(input).backgroundColor,
          borderColor: window.getComputedStyle(input).borderColor
        } : null
      };
    });

    console.log('Current Modal Color Scheme:', modalColors);

    // Document color inconsistencies for redesign
    const designNotes = {
      toolsCardTheme: 'Teal gradient with glass morphism effects',
      modalTheme: 'Plain white modal with gray borders',
      consistency: 'Poor - Modal does not match tools card design language',
      recommendations: [
        'Apply glass morphism effects to modal',
        'Use teal color scheme to match tools card',
        'Add backdrop blur and transparency',
        'Improve visual hierarchy with consistent typography'
      ]
    };

    console.log('Design Analysis:', JSON.stringify(designNotes, null, 2));
  });
});