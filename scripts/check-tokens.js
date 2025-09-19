const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkTokens() {
  try {
    const accounts = await prisma.account.findMany({
      where: { provider: 'google' },
      select: {
        id: true,
        userId: true,
        expires_at: true,
        access_token: true,
        refresh_token: true,
      }
    });
    
    console.log('Google OAuth Account Status:');
    accounts.forEach(account => {
      const now = Math.floor(Date.now() / 1000);
      const expired = account.expires_at && account.expires_at < now;
      
      console.log(`- Account ${account.id}:`);
      console.log(`  User ID: ${account.userId}`);
      console.log(`  Has Access Token: ${account.access_token ? '✅ YES' : '❌ NO'}`);
      console.log(`  Has Refresh Token: ${account.refresh_token ? '✅ YES' : '❌ NO'}`);
      console.log(`  Expires At: ${account.expires_at ? new Date(account.expires_at * 1000).toLocaleString() : 'N/A'}`);
      console.log(`  Status: ${expired ? '❌ EXPIRED' : '✅ VALID'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTokens();