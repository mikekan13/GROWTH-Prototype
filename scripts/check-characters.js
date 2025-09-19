const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const characters = await prisma.character.findMany({
      select: { id: true, name: true, spreadsheetId: true, campaignId: true }
    });

    console.log('All characters in database:');
    characters.forEach(char => {
      console.log(`- ${char.name || 'UNNAMED'} (ID: ${char.id})`);
      console.log(`  Sheet ID: ${char.spreadsheetId || 'NONE'}`);
      console.log(`  Campaign: ${char.campaignId}`);
      console.log('');
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
})();