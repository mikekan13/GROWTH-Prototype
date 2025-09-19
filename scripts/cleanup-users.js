const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanupUsers() {
  try {
    const users = await prisma.user.findMany({ 
      include: { accounts: true } 
    });
    
    for (const user of users) {
      if (user.accounts.length === 0) {
        await prisma.user.delete({ where: { id: user.id } });
        console.log('Deleted orphaned user:', user.email);
      }
    }
    
    console.log('Cleanup completed');
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupUsers();