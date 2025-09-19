/**
 * Global teardown for Playwright tests
 * Cleans up test environment and resets NODE_ENV
 */
import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('🧪 Playwright Global Teardown: Cleaning up test environment');

  // Reset NODE_ENV back to development
  process.env.NODE_ENV = 'development';

  console.log('🧪 Test environment cleaned up');
}

export default globalTeardown;