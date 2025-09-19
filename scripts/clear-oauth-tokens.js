// Clear existing OAuth tokens to force re-authentication
const { PrismaClient } = require('@prisma/client');

async function clearOAuthTokens() {
  const prisma = new PrismaClient();

  try {
    console.log('🧹 Clearing OAuth tokens to force fresh authentication...');

    // Find the user account
    const account = await prisma.account.findFirst({
      where: {
        user: { email: 'mikekan13@gmail.com' },
        provider: 'google'
      },
      include: { user: true }
    });

    if (!account) {
      console.log('❌ No Google account found for mikekan13@gmail.com');
      return;
    }

    console.log('👤 Found account for:', account.user.email);
    console.log('🔍 Current scopes:', account.scope);

    // Delete the account to force complete re-authentication
    await prisma.account.delete({
      where: { id: account.id }
    });

    console.log('✅ OAuth account deleted. User must sign in again to grant Gmail permissions.');
    console.log('');
    console.log('📝 NEXT STEPS:');
    console.log('1. Go to http://localhost:3000');
    console.log('2. Sign out if still logged in');
    console.log('3. Sign in again with mikekan13@gmail.com');
    console.log('4. Make sure to grant ALL permissions including Gmail');
    console.log('5. Test the email sending again');

  } catch (error) {
    console.error('❌ Error clearing tokens:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearOAuthTokens();