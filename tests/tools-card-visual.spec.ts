import { test, expect } from '@playwright/test';

test.describe('ToolsCard Visual Design', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate directly to existing campaign page with valid campaign ID
    await page.goto('/campaign/cmfjxt7fw0009uy7wjh3q5xrl');
    await page.waitForLoadState('networkidle');
  });

  test('should display ToolsCard as centerpiece with proper styling', async ({ page }) => {
    // Wait for ToolsCard to load
    const toolsCard = page.locator('[data-testid="tools-card"]');
    await expect(toolsCard).toBeVisible();

    // Verify the card is positioned in center
    const cardBox = await toolsCard.boundingBox();
    expect(cardBox).toBeTruthy();

    // Check background color matches #22ab94
    const backgroundColor = await toolsCard.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return styles.backgroundColor;
    });

    // Should contain the #22ab94 color (34, 171, 148 in RGB)
    expect(backgroundColor).toContain('34, 171, 148');
  });

  test('should have readable text with proper contrast', async ({ page }) => {
    const toolsCard = page.locator('[data-testid="tools-card"]');

    // Check title text contrast - using div instead of h3
    const title = toolsCard.locator('.text-base.font-bold').first();
    await expect(title).toBeVisible();
    await expect(title).toHaveCSS('color', 'rgb(255, 255, 255)'); // White text

    // Verify text shadow for readability
    const textShadow = await title.evaluate((el) => {
      return window.getComputedStyle(el).textShadow;
    });
    expect(textShadow).not.toBe('none');

    // Check KRMA values are readable
    const krmaValues = toolsCard.locator('[data-testid="krma-value"]');
    await expect(krmaValues.first()).toBeVisible();

    for (let i = 0; i < await krmaValues.count(); i++) {
      const value = krmaValues.nth(i);
      await expect(value).toHaveCSS('color', 'rgb(255, 255, 255)');
    }
  });

  test('should display KRMA breakdown correctly', async ({ page }) => {
    const toolsCard = page.locator('[data-testid="tools-card"]');

    // Wait for KRMA data to load
    await page.waitForSelector('[data-testid="total-krma"]', { timeout: 10000 });

    // Check total KRMA is displayed
    const totalKrma = toolsCard.locator('[data-testid="total-krma"]');
    await expect(totalKrma).toBeVisible();
    await expect(totalKrma).not.toHaveText('0');

    // Check crystallized KRMA section
    const crystallizedKrma = toolsCard.locator('[data-testid="crystallized-krma"]');
    await expect(crystallizedKrma).toBeVisible();

    // Check liquid KRMA section
    const liquidKrma = toolsCard.locator('[data-testid="liquid-krma"]');
    await expect(liquidKrma).toBeVisible();

    // Verify all values are properly formatted (no undefined/null)
    const allKrmaValues = await toolsCard.locator('[data-testid*="krma"]').allTextContents();
    for (const value of allKrmaValues) {
      expect(value).not.toContain('undefined');
      expect(value).not.toContain('null');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  test('should have intuitive create character button', async ({ page }) => {
    const toolsCard = page.locator('[data-testid="tools-card"]');
    const createButton = toolsCard.locator('[data-testid="create-character-btn"]');

    // Button should be visible and styled
    await expect(createButton).toBeVisible();
    await expect(createButton).toBeEnabled();

    // Check button styling
    const buttonStyles = await createButton.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        backgroundColor: styles.backgroundColor,
        borderRadius: styles.borderRadius,
        padding: styles.padding
      };
    });

    // Should have proper styling
    expect(parseFloat(buttonStyles.borderRadius)).toBeGreaterThan(8); // Rounded corners
    expect(buttonStyles.padding).not.toBe('0px');

    // Should have icon and text
    const icon = createButton.locator('svg');
    await expect(icon).toBeVisible();

    const buttonText = await createButton.textContent();
    expect(buttonText).toContain('CREATE');
  });

  test('should open character creation modal', async ({ page }) => {
    const toolsCard = page.locator('[data-testid="tools-card"]');
    const createButton = toolsCard.locator('[data-testid="create-character-btn"]');

    // Click create character button
    await createButton.click();

    // Modal should appear
    const modal = page.locator('[data-testid="character-modal"]');
    await expect(modal).toBeVisible();

    // Check modal has input field
    const nameInput = modal.locator('input[type="text"]');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toBeFocused();

    // Check modal has create button
    const modalCreateBtn = modal.locator('button').filter({ hasText: 'Create' });
    await expect(modalCreateBtn).toBeVisible();

    // Test character creation flow
    await nameInput.fill('Test Character');
    await modalCreateBtn.click();

    // Should show creating state
    await expect(modalCreateBtn).toBeDisabled();
    await expect(modalCreateBtn).toContainText('Creating');
  });

  test('should be responsive and maintain readability at different viewport sizes', async ({ page }) => {
    const toolsCard = page.locator('[data-testid="tools-card"]');

    // Test desktop size
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(toolsCard).toBeVisible();

    // Test tablet size
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(toolsCard).toBeVisible();

    // Ensure text remains readable at smaller sizes
    const title = toolsCard.locator('h3').first();
    const titleBox = await title.boundingBox();
    expect(titleBox?.width).toBeGreaterThan(0);
    expect(titleBox?.height).toBeGreaterThan(0);

    // Test mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(toolsCard).toBeVisible();

    // Card should scale appropriately
    const cardBox = await toolsCard.boundingBox();
    expect(cardBox?.width).toBeLessThan(400); // Should fit mobile width
  });

  test('should have proper visual hierarchy and minimal text', async ({ page }) => {
    const toolsCard = page.locator('[data-testid="tools-card"]');

    // Count text elements to ensure minimalism
    const textElements = await toolsCard.locator('text, span, div').allTextContents();
    const totalTextLength = textElements.join('').length;

    // Should have concise text (adjust threshold as needed)
    expect(totalTextLength).toBeLessThan(200); // Minimal text constraint

    // Check visual hierarchy - using div instead of h3
    const title = toolsCard.locator('.text-base.font-bold').first();
    const krmaValues = toolsCard.locator('[data-testid*="krma"]');

    // Title should exist and be visible
    await expect(title).toBeVisible();

    // KRMA values should be visible
    const krmaCount = await krmaValues.count();
    expect(krmaCount).toBeGreaterThan(0);
  });

  test('should integrate well as KRMA line centerpiece', async ({ page }) => {
    // Check positioning relative to KRMA line
    const krmaLine = page.locator('[data-testid="krma-line"]');
    const toolsCard = page.locator('[data-testid="tools-card"]');

    await expect(krmaLine).toBeVisible();
    await expect(toolsCard).toBeVisible();

    // ToolsCard should be positioned over/on the KRMA line
    const lineBox = await krmaLine.boundingBox();
    const cardBox = await toolsCard.boundingBox();

    expect(lineBox).toBeTruthy();
    expect(cardBox).toBeTruthy();

    // Card should be centered horizontally relative to line
    const lineCenterX = lineBox!.x + lineBox!.width / 2;
    const cardCenterX = cardBox!.x + cardBox!.width / 2;
    const centerDiff = Math.abs(lineCenterX - cardCenterX);

    expect(centerDiff).toBeLessThan(50); // Should be reasonably centered

    // Card should stand out visually from background
    const cardZIndex = await toolsCard.evaluate(el => window.getComputedStyle(el).zIndex);
    expect(parseInt(cardZIndex) || 0).toBeGreaterThanOrEqual(1);
  });
});