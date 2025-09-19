import { test, expect } from '@playwright/test';

test.describe('API Endpoints', () => {
  test('should return 401 for protected API routes without auth', async ({ request }) => {
    const protectedRoutes = [
      '/api/campaigns',
      '/api/admin/users',
      '/api/admin/krma/wallets',
      '/api/players/my-campaigns',
      '/api/characters'
    ];

    for (const route of protectedRoutes) {
      const response = await request.get(route);
      expect(response.status()).toBe(401);
    }
  });

  test('should return proper headers for API routes', async ({ request }) => {
    const response = await request.get('/api/campaigns');

    // Check for CORS headers or proper API response format
    expect(response.headers()['content-type']).toContain('application/json');
  });

  test('should handle non-existent API routes', async ({ request }) => {
    const response = await request.get('/api/non-existent-route');
    expect(response.status()).toBe(404);
  });

  test('should return proper error format for invalid requests', async ({ request }) => {
    const response = await request.post('/api/campaigns', {
      data: { invalid: 'data' }
    });

    // Should return error response (401 for auth or 400 for bad request)
    expect([400, 401]).toContain(response.status());

    if (response.status() !== 401) {
      const body = await response.json();
      expect(body).toHaveProperty('error');
    }
  });
});