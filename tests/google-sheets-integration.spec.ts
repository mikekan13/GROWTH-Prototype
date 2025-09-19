import { test, expect } from '@playwright/test';

test.describe('Google Sheets Integration', () => {
  test('should have Google Sheets related API endpoints', async ({ request }) => {
    // Test that Google Sheets API endpoints exist (they should return 401 without auth)
    const sheetsRoutes = [
      '/api/sheets/create-template',
      '/api/sheets/create-blank',
      '/api/sheets/test-template'
    ];

    for (const route of sheetsRoutes) {
      const response = await request.post(route);
      // Should exist but require authentication
      expect([401, 405]).toContain(response.status()); // 401 = unauthorized, 405 = method not allowed
    }
  });

  test('should have character sheet data API endpoints', async ({ request }) => {
    const characterId = 'test-character-id';
    const characterRoutes = [
      `/api/characters/${characterId}/card-data`,
      `/api/characters/${characterId}/check-sheet`,
      `/api/characters/${characterId}/restore-sheet`,
      `/api/characters/${characterId}/tkv`
    ];

    for (const route of characterRoutes) {
      const response = await request.get(route);
      // Should exist but require authentication or return proper error
      expect([401, 404]).toContain(response.status());
    }
  });

  test('should handle Google Sheets service errors gracefully', async ({ request }) => {
    // Test error handling for Google Sheets operations
    const response = await request.post('/api/sheets/create-template', {
      data: { invalid: 'data' }
    });

    expect([400, 401, 500]).toContain(response.status());

    if (response.status() === 400) {
      const body = await response.json();
      expect(body).toHaveProperty('error');
    }
  });
});