// Fix OAuthAccountNotLinked error by cleaning orphaned user data
const { PrismaClient } = require('@prisma/client');

async function fixOAuthOrphan() {
  const prisma = new PrismaClient();

  try {
    console.log('🧹 Fixing OAuthAccountNotLinked error...');
    console.log('================================');

    // Find all users and check if they have linked accounts
    const users = await prisma.user.findMany({
      include: { accounts: true, sessions: true }
    });

    console.log(`Found ${users.length} user(s):`);

    for (const user of users) {
      console.log(`\n👤 User: ${user.email || 'No email'}`);
      console.log(`   Accounts: ${user.accounts.length}`);
      console.log(`   Sessions: ${user.sessions.length}`);

      // If user has no OAuth accounts, delete them
      if (user.accounts.length === 0) {
        console.log('🗑️  Deleting orphaned user...');

        // Delete sessions first
        await prisma.session.deleteMany({
          where: { userId: user.id }
        });

        // Delete user
        await prisma.user.delete({
          where: { id: user.id }
        });

        console.log('✅ Deleted orphaned user:', user.email);
      } else {
        console.log('✅ User has linked accounts, keeping');
      }
    }

    console.log('\n🔧 OAuth cleanup complete!');
    console.log('\n📝 Next steps:');
    console.log('1. Open an incognito/private browser window');
    console.log('2. Go to http://localhost:3000');
    console.log('3. Sign in with mikekan13@gmail.com');
    console.log('4. Make sure to grant ALL permissions including Gmail');

  } catch (error) {
    console.error('❌ Error fixing OAuth:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixOAuthOrphan();