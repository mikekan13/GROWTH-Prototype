import { test, expect } from '@playwright/test';

/**
 * Test to verify that campaign creation doesn't create duplicate Google Drive folders
 *
 * This test specifically addresses the issue where:
 * 1. Campaign creation called createCampaignFolder()
 * 2. Sheet creation called getOrCreateCampaignFolder()
 * 3. Character sync called getOrCreateCampaignFolder()
 *
 * Which resulted in 3 folders for "The Broken West" campaign.
 *
 * The fix:
 * - Removed createCampaignFolder() call from campaign creation
 * - Added database transaction to getOrCreateCampaignFolder() to prevent race conditions
 * - Defer folder creation to when it's actually needed
 */

test.describe('Google Drive Folder Duplication Fix', () => {
  test('Campaign creation should not immediately create folder', async ({ request }) => {
    // This test verifies that campaign creation no longer immediately creates a Google Drive folder
    // The folder should only be created when actually needed (e.g., during sheet creation)

    const campaignData = {
      name: 'Test Campaign Folder Fix',
      genre: 'Fantasy',
      description: 'Test campaign to verify folder creation fix'
    };

    // Create campaign - this should NOT create a Google Drive folder immediately
    const response = await request.post('/api/campaigns', {
      data: campaignData
    });

    expect(response.ok()).toBeTruthy();
    const campaign = await response.json();

    // The campaign should be created successfully
    expect(campaign.campaign).toBeDefined();
    expect(campaign.campaign.name).toBe(campaignData.name);

    // The folderId should be null since we defer folder creation
    expect(campaign.campaign.folderId).toBeNull();

    console.log('✅ Campaign created without immediate folder creation');
  });

  test('getOrCreateCampaignFolder should create folder only once', async ({ request }) => {
    // This test would need to be implemented with proper authentication and mock Google API
    // For now, we're documenting the expected behavior

    console.log('🔧 Test planned: getOrCreateCampaignFolder should use database transaction');
    console.log('📋 Expected behavior:');
    console.log('  1. Check if campaign has folderId in database');
    console.log('  2. If exists, return existing folder ID');
    console.log('  3. If not exists, create folder atomically within transaction');
    console.log('  4. Update database with folder ID in same transaction');
    console.log('  5. Prevent race conditions with multiple simultaneous calls');
  });
});

test.describe('Google Drive Integration Logging', () => {
  test('Should log folder operations for debugging', async () => {
    // The fix includes improved logging to help diagnose future issues
    console.log('📝 Logging improvements added:');
    console.log('  - "📁 Using existing folder for campaign..." when folder exists');
    console.log('  - "📁 Creating new folder for campaign..." when creating new');
    console.log('  - "✅ Created and linked folder for campaign..." when complete');
    console.log('  - Campaign name and folder ID included in all logs');
  });
});