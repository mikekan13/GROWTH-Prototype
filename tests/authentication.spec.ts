import { test, expect } from '@playwright/test';
import { authenticateTestUser, cleanupTestData } from './test-helpers';

test.describe('Authentication Flow', () => {
  test.afterEach(async ({ page }) => {
    // Clean up test data after each test
    await cleanupTestData(page);
  });

  test('should redirect to sign-in page when not authenticated', async ({ page }) => {
    await page.goto('/campaigns');

    // Should redirect to NextAuth sign-in page
    await expect(page).toHaveURL(/\/auth\/signin/);

    // Should show Google sign-in option
    await expect(page.locator('text=Sign in with Google')).toBeVisible();
  });

  test('should show home page elements when visiting root', async ({ page }) => {
    await page.goto('/');

    // Should show the home page content
    await expect(page.locator('h1')).toContainText(['GROWTH', 'Welcome']);

    // Should have sign-in button or link
    await expect(page.locator('text=Sign')).toBeVisible();
  });

  test('should handle sign-in page correctly', async ({ page }) => {
    await page.goto('/auth/signin');

    // Should show the NextAuth sign-in page
    await expect(page.locator('text=Sign in')).toBeVisible();

    // Should have Google provider button
    await expect(page.locator('form')).toBeVisible();
  });

  test('should authenticate test user without Google OAuth', async ({ page }) => {
    // Use bypass authentication for WATCHER role
    const session = await authenticateTestUser(page, 'WATCHER');

    expect(session.user.email).toBe('test-watcher@playwright.test');
    expect(session.user.role).toBe('WATCHER');

    // Navigate to protected page
    await page.goto('/campaigns');

    // Should NOT redirect to sign-in page
    await expect(page).not.toHaveURL(/\/auth\/signin/);

    // Should show campaigns page for authenticated user
    await expect(page.locator('h1')).toContainText('Campaign');
  });

  test('should authenticate admin user with proper permissions', async ({ page }) => {
    // Use bypass authentication for ADMIN role
    const session = await authenticateTestUser(page, 'ADMIN');

    expect(session.user.email).toBe('test-admin@playwright.test');
    expect(session.user.role).toBe('ADMIN');

    // Navigate to admin page
    await page.goto('/admin');

    // Should show admin interface
    await expect(page.locator('text=Admin')).toBeVisible();
  });

  test('should authenticate trailblazer user', async ({ page }) => {
    // Use bypass authentication for TRAILBLAZER role
    const session = await authenticateTestUser(page, 'TRAILBLAZER');

    expect(session.user.email).toBe('test-trailblazer@playwright.test');
    expect(session.user.role).toBe('TRAILBLAZER');

    // Navigate to trailblazer page
    await page.goto('/trailblazer');

    // Should show trailblazer interface
    await expect(page.locator('text=Character')).toBeVisible();
  });
});