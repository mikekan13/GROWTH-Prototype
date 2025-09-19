// Check OAuth scopes for the user
const { PrismaClient } = require('@prisma/client');

async function checkOAuthScopes() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Checking OAuth scopes for users...');

    const accounts = await prisma.account.findMany({
      where: { provider: 'google' },
      include: { user: true }
    });

    console.log(`Found ${accounts.length} Google accounts:`);

    accounts.forEach((account, index) => {
      console.log(`\n${index + 1}. User: ${account.user.email || 'No email'}`);
      console.log(`   User ID: ${account.userId}`);
      console.log(`   Account ID: ${account.id}`);
      console.log(`   Access Token: ${account.access_token ? 'Present' : 'Missing'}`);
      console.log(`   Refresh Token: ${account.refresh_token ? 'Present' : 'Missing'}`);
      console.log(`   Expires At: ${account.expires_at ? new Date(account.expires_at * 1000) : 'No expiry'}`);
      console.log(`   Raw Scope: ${account.scope || 'No scopes recorded'}`);

      if (account.scope) {
        const scopes = account.scope.split(' ');
        console.log(`   Parsed Scopes (${scopes.length}):`);
        scopes.forEach(scope => {
          console.log(`     - ${scope}`);
        });

        const hasGmailScope = scopes.includes('https://www.googleapis.com/auth/gmail.send');
        console.log(`   Gmail Send Permission: ${hasGmailScope ? '✅ YES' : '❌ NO'}`);
      }
    });

  } catch (error) {
    console.error('❌ Error checking OAuth scopes:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkOAuthScopes();