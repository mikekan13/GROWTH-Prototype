const { PrismaClient } = require('@prisma/client');

async function fixRoleTerminology() {
  const prisma = new PrismaClient();

  try {
    console.log('🔄 Fixing role terminology...');

    // Update users from GM to WATCHER (GM = Watcher in GROWTH)
    const updateResult = await prisma.user.updateMany({
      where: { role: 'GM' },
      data: { role: 'WATCHER' }
    });

    console.log(`✅ Updated ${updateResult.count} users from GM to WATCHER`);

    // Show current role distribution
    const roleDistribution = await prisma.user.groupBy({
      by: ['role'],
      _count: true
    });

    console.log('📊 Current role distribution:');
    roleDistribution.forEach(({ role, _count }) => {
      console.log(`  ${role}: ${_count}`);
    });

  } catch (error) {
    console.error('❌ Fix failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixRoleTerminology();