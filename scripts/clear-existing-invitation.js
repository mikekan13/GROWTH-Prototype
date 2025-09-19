// Clear existing invitation to test fresh Gmail sending
const { PrismaClient } = require('@prisma/client');

async function clearInvitation() {
  const prisma = new PrismaClient();

  try {
    console.log('🧹 Clearing existing invitation for KyleenKantack@gmail.com...');

    const deleted = await prisma.playerInvitation.deleteMany({
      where: { playerEmail: 'KyleenKantack@gmail.com' }
    });

    console.log(`✅ Deleted ${deleted.count} invitation(s)`);
    console.log('💡 You can now test a fresh invitation');

  } catch (error) {
    console.error('❌ Error clearing invitation:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearInvitation();