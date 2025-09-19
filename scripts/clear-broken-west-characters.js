const { PrismaClient } = require('@prisma/client');
const { google } = require('googleapis');

async function clearBrokenWestCharacters() {
  const prisma = new PrismaClient();

  try {
    // Find the Broken West campaign
    const campaign = await prisma.campaign.findFirst({
      where: { name: "The Broken West" },
      include: { characters: true }
    });

    if (!campaign) {
      console.log('❌ Campaign "The Broken West" not found');
      return;
    }

    console.log(`📋 Found campaign: ${campaign.name} (${campaign.id})`);
    console.log(`👥 Characters to delete: ${campaign.characters.length}`);

    if (campaign.characters.length === 0) {
      console.log('✅ No characters to delete');
      return;
    }

    // Set up Google Auth for sheet deletion
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });

    const drive = google.drive({ version: 'v3', auth });

    // Delete each character
    for (const character of campaign.characters) {
      console.log(`🗑️  Deleting character: ${character.name} (${character.id})`);

      // Delete Google Sheet first
      if (character.spreadsheetId) {
        try {
          await drive.files.delete({
            fileId: character.spreadsheetId
          });
          console.log(`   ✅ Deleted Google Sheet: ${character.spreadsheetId}`);
        } catch (driveError) {
          console.log(`   ⚠️  Failed to delete Google Sheet: ${driveError.message}`);
        }
      }

      // Delete from database (cascade deletes will handle related records)
      await prisma.character.delete({
        where: { id: character.id }
      });
      console.log(`   ✅ Deleted character from database`);
    }

    console.log('🎉 All characters cleared from "The Broken West" campaign!');

  } catch (error) {
    console.error('❌ Error clearing characters:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearBrokenWestCharacters();