/**
 * Global setup for Playwright tests
 * Sets NODE_ENV=test and initializes test environment
 */
import { FullConfig } from '@playwright/test';

async function globalSetup(_config: FullConfig) {
  // Set NODE_ENV to test for the duration of tests
  process.env.NODE_ENV = 'test';

  console.log('🧪 Playwright Global Setup: Setting NODE_ENV=test');
  console.log('🧪 Test authentication bypass endpoints will be available');

  // Wait a moment for environment to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));
}

export default globalSetup;