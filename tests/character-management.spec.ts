import { test, expect } from '@playwright/test';

test.describe('Character Management', () => {
  test('should have character-related API routes', async ({ request }) => {
    const characterRoutes = [
      '/api/characters',
      '/api/campaigns/test-id/characters'
    ];

    for (const route of characterRoutes) {
      const response = await request.get(route);
      // Should require authentication
      expect(response.status()).toBe(401);
    }
  });

  test('should handle character CRUD operations structure', async ({ request }) => {
    const characterId = 'test-character-id';

    // Test GET character
    const getResponse = await request.get(`/api/characters/${characterId}`);
    expect([401, 404]).toContain(getResponse.status());

    // Test DELETE character
    const deleteResponse = await request.delete(`/api/characters/${characterId}`);
    expect([401, 404]).toContain(deleteResponse.status());

    // Test POST character creation
    const postResponse = await request.post('/api/characters', {
      data: { name: 'Test Character' }
    });
    expect([400, 401]).toContain(postResponse.status());
  });

  test('should validate character data structure in API responses', async ({ request }) => {
    // Test that character creation requires proper data
    const response = await request.post('/api/characters', {
      data: {} // Empty data should fail validation
    });

    expect([400, 401]).toContain(response.status());

    if (response.status() === 400) {
      const body = await response.json();
      expect(body).toHaveProperty('error');
    }
  });

  test('should handle character sheet fallback scenarios', async ({ request }) => {
    const characterId = 'test-character-id';

    // Test fallback data endpoint
    const response = await request.get(`/api/characters/${characterId}/card-data`);
    expect([401, 404]).toContain(response.status());

    // Test sheet restoration endpoint
    const restoreResponse = await request.post(`/api/characters/${characterId}/restore-sheet`);
    expect([401, 404]).toContain(restoreResponse.status());
  });
});