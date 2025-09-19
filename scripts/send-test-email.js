// Direct test of email sending with proper session context
const { PrismaClient } = require('@prisma/client');

async function sendTestEmailDirectly() {
  const prisma = new PrismaClient();

  try {
    console.log('🧪 Direct email sending test...');

    // Get the user and session info
    const user = await prisma.user.findUnique({
      where: { email: 'mikekan13@gmail.com' },
      include: { accounts: true, gmProfile: true }
    });

    if (!user) {
      throw new Error('User not found');
    }

    console.log('👤 Found user:', user.email);
    console.log('🔑 OAuth accounts:', user.accounts.length);
    console.log('🎯 GM Profile:', user.gmProfile ? 'Yes' : 'No');

    const googleAccount = user.accounts.find(acc => acc.provider === 'google');
    if (!googleAccount) {
      throw new Error('No Google account found');
    }

    console.log('✅ Google OAuth account found with scopes:', googleAccount.scope);

    // Now let's test the player invitation system
    if (user.gmProfile) {
      console.log('🎲 Testing player invitation...');

      // Create a fake session context for the email service
      const mockSession = {
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      };

      console.log('📧 Creating invitation for KyleenKantack@gmail.com...');

      // Import and test the service directly
      // Note: This requires careful module loading in Node.js context
      console.log('⚠️ Manual email test required through web interface');
      console.log('🌐 Go to http://localhost:3000 and sign in as mikekan13@gmail.com');
      console.log('📧 Then use the player invitation feature to invite KyleenKantack@gmail.com');

    } else {
      console.log('❌ User is not a GM - cannot test player invitations');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

sendTestEmailDirectly();