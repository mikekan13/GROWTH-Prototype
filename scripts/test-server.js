#!/usr/bin/env node

/**
 * Test server startup script
 * Ensures NODE_ENV=test and starts the development server for Playwright tests
 */

const { spawn } = require('child_process');
const path = require('path');

// Set environment to test
process.env.NODE_ENV = 'test';
process.env.PLAYWRIGHT_TEST = 'true';

console.log('🧪 Starting test server with NODE_ENV=test and PLAYWRIGHT_TEST=true');
console.log('Environment:', process.env.NODE_ENV);
console.log('Playwright Test Mode:', process.env.PLAYWRIGHT_TEST);

// Run the cleanup and start script with test environment
const scriptPath = path.join(__dirname, 'cleanup-and-start.js');
const testServer = spawn('node', [scriptPath], {
  env: {
    ...process.env,
    NODE_ENV: 'test'
  },
  stdio: 'inherit'
});

testServer.on('close', (code) => {
  console.log(`🧪 Test server exited with code ${code}`);
  process.exit(code);
});

testServer.on('error', (error) => {
  console.error('🧪 Test server error:', error);
  process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('🧪 Stopping test server...');
  testServer.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('🧪 Terminating test server...');
  testServer.kill('SIGTERM');
});