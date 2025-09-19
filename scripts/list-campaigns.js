const { PrismaClient } = require('@prisma/client');

async function listCampaigns() {
  const prisma = new PrismaClient();

  try {
    const campaigns = await prisma.campaign.findMany({
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            characters: true
          }
        }
      }
    });

    console.log('Available campaigns:');
    campaigns.forEach(campaign => {
      console.log(`- ${campaign.name} (${campaign.id}) - ${campaign._count.characters} characters`);
    });

    return campaigns;
  } finally {
    await prisma.$disconnect();
  }
}

listCampaigns().catch(console.error);