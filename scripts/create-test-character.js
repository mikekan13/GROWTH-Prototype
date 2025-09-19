const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    // Create a test character with a fake/deleted sheet ID
    const testCharacter = await prisma.character.create({
      data: {
        name: 'Test Broken Sheet',
        campaignId: 'cmfjxt7fw0009uy7wjh3q5xrl', // Use existing campaign
        spreadsheetId: 'FAKE_SHEET_ID_12345', // This sheet doesn't exist
        json: {},
        revId: null
      }
    });

    console.log('Created test character with broken sheet:');
    console.log(`- Name: ${testCharacter.name}`);
    console.log(`- ID: ${testCharacter.id}`);
    console.log(`- Fake Sheet ID: ${testCharacter.spreadsheetId}`);
    console.log('');
    console.log('This character should now show with a red exclamation overlay!');
  } catch (error) {
    console.error('Error creating test character:', error);
  } finally {
    await prisma.$disconnect();
  }
})();