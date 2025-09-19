const { PrismaClient } = require('@prisma/client');

async function finalRoleFix() {
  const prisma = new PrismaClient();

  try {
    console.log('🔄 Final role fix - checking database state...');

    // First, let's see what we have
    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true, role: true }
    });

    console.log('📊 Current users in database:');
    allUsers.forEach(user => {
      console.log(`  ${user.email}: ${user.role} (ID: ${user.id})`);
    });

    // Use raw SQL to update any problematic roles
    console.log('\n🔄 Using raw SQL to fix any invalid roles...');

    await prisma.$executeRaw`UPDATE User SET role = 'WATCHER' WHERE role NOT IN ('ADMIN', 'WATCHER', 'TRAILBLAZER', 'GODHEAD')`;

    console.log('✅ Fixed any invalid roles');

    // Check final state
    const finalUsers = await prisma.user.findMany({
      select: { id: true, email: true, role: true }
    });

    console.log('\n📊 Final user roles:');
    finalUsers.forEach(user => {
      console.log(`  ${user.email}: ${user.role}`);
    });

  } catch (error) {
    console.error('❌ Fix failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

finalRoleFix();