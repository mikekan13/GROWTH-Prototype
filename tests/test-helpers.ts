import { Page, expect } from '@playwright/test';
import { TEST_USERS } from '../src/lib/testAuth';

export interface TestSession {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  sessionToken: string;
}

/**
 * Authenticates a test user without going through Google OAuth
 * Only works in test environment
 */
export async function authenticateTestUser(
  page: Page,
  userType: keyof typeof TEST_USERS
): Promise<TestSession> {
  // Call test login endpoint
  const response = await page.request.post('/api/test/auth/login', {
    data: { userType }
  });

  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.success).toBe(true);

  // Set the session cookie manually
  await page.context().addCookies([
    {
      name: 'next-auth.session-token',
      value: result.sessionToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax'
    }
  ]);

  return {
    user: result.session.user,
    sessionToken: result.sessionToken
  };
}

/**
 * Cleans up all test data after tests
 */
export async function cleanupTestData(page: Page): Promise<void> {
  const response = await page.request.post('/api/test/auth/cleanup');
  expect(response.ok()).toBeTruthy();
}

export class TestHelpers {
  static async waitForPageLoad(page: Page) {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500); // Small buffer for any remaining async operations
  }

  static async checkForJavaScriptErrors(page: Page) {
    const errors: string[] = [];

    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    return errors;
  }

  static async isElementVisible(page: Page, selector: string): Promise<boolean> {
    try {
      await page.locator(selector).waitFor({ state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  static async checkApiEndpointStatus(page: Page, endpoint: string): Promise<number> {
    const response = await page.request.get(endpoint);
    return response.status();
  }

  static async checkAccessibility(page: Page) {
    // Basic accessibility checks
    const hasTitle = await page.title();
    expect(hasTitle).toBeTruthy();

    // Check for basic landmark elements
    const landmarks = [
      'main',
      'nav',
      'header',
      'footer'
    ];

    const foundLandmarks: string[] = [];
    for (const landmark of landmarks) {
      const exists = await this.isElementVisible(page, landmark);
      if (exists) {
        foundLandmarks.push(landmark);
      }
    }

    return foundLandmarks;
  }

  static async checkImageAltText(page: Page) {
    const images = page.locator('img');
    const imageCount = await images.count();
    const imagesWithoutAlt: number[] = [];

    for (let i = 0; i < imageCount; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      if (!alt || alt.trim() === '') {
        imagesWithoutAlt.push(i);
      }
    }

    return {
      totalImages: imageCount,
      imagesWithoutAlt: imagesWithoutAlt.length
    };
  }

  static async testFormValidation(page: Page, formSelector: string, testData: Record<string, string>) {
    const form = page.locator(formSelector);

    // Fill form with test data
    for (const [field, value] of Object.entries(testData)) {
      await form.locator(`[name="${field}"]`).fill(value);
    }

    // Try to submit
    await form.locator('button[type="submit"]').click();

    // Check for validation messages
    const validationMessages = await page.locator('.error, .invalid, [aria-invalid="true"]').count();
    return validationMessages;
  }

  static async checkLocalStorage(page: Page, keys: string[]) {
    const storage = await page.evaluate((keys) => {
      const result: Record<string, string | null> = {};
      keys.forEach(key => {
        result[key] = localStorage.getItem(key);
      });
      return result;
    }, keys);

    return storage;
  }

  static async checkSessionStorage(page: Page, keys: string[]) {
    const storage = await page.evaluate((keys) => {
      const result: Record<string, string | null> = {};
      keys.forEach(key => {
        result[key] = sessionStorage.getItem(key);
      });
      return result;
    }, keys);

    return storage;
  }

  static async mockApiResponse(page: Page, url: string, response: unknown) {
    await page.route(url, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response)
      });
    });
  }

  static async simulateNetworkError(page: Page, url: string) {
    await page.route(url, async (route) => {
      await route.abort('failed');
    });
  }

  static async measurePageLoadTime(page: Page, url: string) {
    const startTime = Date.now();
    await page.goto(url);
    await this.waitForPageLoad(page);
    const endTime = Date.now();

    return endTime - startTime;
  }
}