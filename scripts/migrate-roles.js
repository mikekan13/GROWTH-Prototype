const { PrismaClient } = require('@prisma/client');

async function migrateRoles() {
  const prisma = new PrismaClient();

  try {
    console.log('🔄 Starting role migration...');

    // Update all users with WATCHER role to GM role
    const updateResult = await prisma.user.updateMany({
      where: { role: 'WATCHER' },
      data: { role: 'GM' }
    });

    console.log(`✅ Updated ${updateResult.count} users from WATCHER to GM`);

    // Verify the migration
    const remainingWatchers = await prisma.user.count({
      where: { role: 'WATCHER' }
    });

    if (remainingWatchers === 0) {
      console.log('✅ Migration successful - no WATCHER roles remaining');
    } else {
      console.log(`⚠️  Warning: ${remainingWatchers} WATCHER roles still exist`);
    }

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
    console.error('❌ Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateRoles();