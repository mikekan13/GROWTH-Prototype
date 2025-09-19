import { test, expect } from '@playwright/test';

test.describe('Campaign Management', () => {
  test('should redirect to login for campaign pages when not authenticated', async ({ page }) => {
    await page.goto('/campaigns');

    // Should redirect to authentication
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('should handle campaign CRUD API operations', async ({ request }) => {
    // Test campaigns list endpoint
    const listResponse = await request.get('/api/campaigns');
    expect(listResponse.status()).toBe(401);

    // Test campaign creation
    const createResponse = await request.post('/api/campaigns', {
      data: { name: 'Test Campaign' }
    });
    expect([400, 401]).toContain(createResponse.status());

    // Test individual campaign access
    const campaignResponse = await request.get('/api/campaigns/test-id');
    expect([401, 404]).toContain(campaignResponse.status());
  });

  test('should validate campaign data structure', async ({ request }) => {
    const response = await request.post('/api/campaigns', {
      data: { invalid: 'structure' }
    });

    expect([400, 401]).toContain(response.status());

    if (response.status() === 400) {
      const body = await response.json();
      expect(body).toHaveProperty('error');
    }
  });

  test('should handle campaign character relationships', async ({ request }) => {
    const campaignId = 'test-campaign-id';

    // Test campaign characters endpoint
    const response = await request.get(`/api/campaigns/${campaignId}/characters`);
    expect([401, 404]).toContain(response.status());

    // Test adding characters to campaign
    const addResponse = await request.post(`/api/campaigns/${campaignId}/characters`, {
      data: { characterId: 'test-character-id' }
    });
    expect([400, 401, 404]).toContain(addResponse.status());
  });

  test('should handle campaign cleanup operations', async ({ request }) => {
    const campaignId = 'test-campaign-id';

    const response = await request.post(`/api/campaigns/${campaignId}/characters/cleanup`);
    expect([401, 404]).toContain(response.status());
  });
});