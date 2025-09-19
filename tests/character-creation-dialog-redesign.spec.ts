import { test, expect } from '@playwright/test';
import { authenticateTestUser, cleanupTestData } from './test-helpers';

test.describe('Character Creation Dialog - Redesign and Test', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as WATCHER to access character creation
    await authenticateTestUser(page, 'WATCHER');
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestData(page);
  });

  test('should analyze current character creation dialog design', async ({ page }) => {
    // Go to campaigns page where ToolsCard should be visible
    await page.goto('/campaigns');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Take screenshot of the initial page
    await page.screenshot({
      path: 'test-results/campaigns-page-with-tools.png',
      fullPage: true
    });

    // Look for the tools card
    const toolsCard = page.locator('[data-testid="tools-card"]');
    await expect(toolsCard).toBeVisible({ timeout: 10000 });

    // Take screenshot of the tools card specifically
    await toolsCard.screenshot({
      path: 'test-results/tools-card-current.png'
    });

    // Click the create character button
    const createButton = page.locator('[data-testid="create-character-btn"]');
    await expect(createButton).toBeVisible();

    // Take screenshot before clicking
    await page.screenshot({
      path: 'test-results/before-modal-click.png',
      fullPage: false
    });

    await createButton.click();

    // Wait for modal to appear
    const modal = page.locator('[data-testid="character-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Take screenshot of the current modal design
    await page.screenshot({
      path: 'test-results/character-modal-current-design.png',
      fullPage: false
    });

    // Analyze current modal structure and styles
    const modalAnalysis = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="character-modal"]');
      if (!modal) return null;

      const modalParent = modal.closest('.fixed');
      const contentDiv = modal.querySelector('.bg-white');
      const title = modal.querySelector('h3');
      const input = modal.querySelector('#characterName');
      const buttons = Array.from(modal.querySelectorAll('button'));

      return {
        modal: {
          exists: !!modal,
          className: modal.className,
          boundingRect: modal.getBoundingClientRect()
        },
        modalParent: modalParent ? {
          className: modalParent.className,
          styles: {
            backgroundColor: window.getComputedStyle(modalParent).backgroundColor,
            backdropFilter: window.getComputedStyle(modalParent).backdropFilter
          }
        } : null,
        contentDiv: contentDiv ? {
          className: contentDiv.className,
          styles: {
            backgroundColor: window.getComputedStyle(contentDiv).backgroundColor,
            borderRadius: window.getComputedStyle(contentDiv).borderRadius,
            boxShadow: window.getComputedStyle(contentDiv).boxShadow,
            padding: window.getComputedStyle(contentDiv).padding
          }
        } : null,
        title: title ? {
          text: title.textContent,
          className: title.className,
          styles: {
            color: window.getComputedStyle(title).color,
            fontSize: window.getComputedStyle(title).fontSize,
            fontWeight: window.getComputedStyle(title).fontWeight
          }
        } : null,
        input: input ? {
          className: input.className,
          styles: {
            backgroundColor: window.getComputedStyle(input).backgroundColor,
            border: window.getComputedStyle(input).border,
            borderRadius: window.getComputedStyle(input).borderRadius,
            padding: window.getComputedStyle(input).padding
          }
        } : null,
        buttons: buttons.map(btn => ({
          text: btn.textContent?.trim(),
          className: btn.className,
          styles: {
            backgroundColor: window.getComputedStyle(btn).backgroundColor,
            color: window.getComputedStyle(btn).color,
            border: window.getComputedStyle(btn).border,
            borderRadius: window.getComputedStyle(btn).borderRadius
          }
        }))
      };
    });

    console.log('Current Modal Analysis:', JSON.stringify(modalAnalysis, null, 2));

    // Test form interaction
    const nameInput = modal.locator('#characterName');
    await nameInput.fill('Test Character Analysis');

    // Take screenshot with filled form
    await page.screenshot({
      path: 'test-results/character-modal-filled.png',
      fullPage: false
    });

    // Get tools card styles for comparison
    const toolsCardStyles = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="tools-card"]');
      if (!card) return null;

      return {
        className: card.className,
        styles: {
          backgroundColor: window.getComputedStyle(card).backgroundColor,
          background: window.getComputedStyle(card).background,
          borderRadius: window.getComputedStyle(card).borderRadius,
          boxShadow: window.getComputedStyle(card).boxShadow,
          border: window.getComputedStyle(card).border
        }
      };
    });

    console.log('Tools Card Styles for Comparison:', JSON.stringify(toolsCardStyles, null, 2));

    // Document the design inconsistencies
    const designProblems = {
      current: {
        modal: 'Plain white modal with basic gray overlay',
        toolsCard: 'Teal gradient with glass morphism effects and backdrop blur'
      },
      inconsistencies: [
        'Modal uses white background vs tools card teal gradient',
        'No glass morphism effects on modal',
        'No backdrop blur on modal overlay',
        'Different border radius styles',
        'Inconsistent color scheme',
        'Different typography treatments'
      ],
      recommendations: [
        'Apply teal gradient background to modal',
        'Add glass morphism effects with backdrop blur',
        'Use consistent border radius (rounded-2xl)',
        'Apply white text with text shadow',
        'Add enhanced shadow with teal tint',
        'Use consistent button styling'
      ]
    };

    console.log('Design Analysis Report:', JSON.stringify(designProblems, null, 2));

    // Close modal
    const cancelButton = modal.locator('button:has-text("Cancel")');
    await cancelButton.click();
    await expect(modal).not.toBeVisible();
  });

  test('should prepare for modal redesign implementation', async ({ page }) => {
    await page.goto('/campaigns');

    // Take final screenshot for redesign reference
    await page.screenshot({
      path: 'test-results/redesign-reference.png',
      fullPage: true
    });

    // Extract the exact tools card design properties for replication
    const designSpecs = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="tools-card"]');
      if (!card) return null;

      const styles = window.getComputedStyle(card);

      return {
        colors: {
          primary: '#22ab94',
          secondary: '#1e9b82',
          background: styles.background,
          boxShadow: styles.boxShadow
        },
        effects: {
          borderRadius: styles.borderRadius,
          backdropFilter: styles.backdropFilter || 'blur(10px)',
          border: styles.border
        },
        typography: {
          fontFamily: 'monospace',
          letterSpacing: '0.05em',
          textShadow: '0 2px 4px rgba(0,0,0,0.4)'
        },
        cssProperties: {
          backgroundColor: styles.backgroundColor,
          backgroundImage: styles.backgroundImage,
          padding: styles.padding,
          margin: styles.margin
        }
      };
    });

    console.log('Tools Card Design Specifications for Modal:', JSON.stringify(designSpecs, null, 2));

    // Store design specifications for implementation
    await page.evaluate((specs) => {
      window.MODAL_REDESIGN_SPECS = specs;
    }, designSpecs);
  });
});