const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createUserWallet() {
  try {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: 'mikekan13@gmail.com' },
      include: { gmProfile: true }
    });

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('👤 Found user:', user.email);
    console.log('   Role:', user.role);
    console.log('   User ID:', user.id);
    console.log('   Has GMProfile:', !!user.gmProfile);

    // Check if wallet already exists
    const existingWallet = await prisma.wallet.findUnique({
      where: {
        ownerType_ownerRef: {
          ownerType: 'WATCHER',
          ownerRef: user.id
        }
      }
    });

    if (existingWallet) {
      console.log('💰 Wallet already exists:');
      console.log('   Liquid:', existingWallet.liquid.toLocaleString(), 'KRMA');
      console.log('   Crystalized:', existingWallet.crystalized.toLocaleString(), 'KRMA');
      return;
    }

    // Create wallet with 10k KRMA (standard GM starting amount)
    const wallet = await prisma.wallet.create({
      data: {
        ownerType: 'WATCHER',
        ownerRef: user.id,
        liquid: BigInt(10000), // 10k KRMA
        crystalized: BigInt(0)
      }
    });

    // Also update the legacy krmaBalance field
    await prisma.user.update({
      where: { id: user.id },
      data: {
        krmaBalance: BigInt(10000)
      }
    });

    console.log('✅ Created wallet for', user.email);
    console.log('   Liquid KRMA:', wallet.liquid.toLocaleString());
    console.log('   Crystalized KRMA:', wallet.crystalized.toLocaleString());
    console.log('   Total KRMA:', (wallet.liquid + wallet.crystalized).toLocaleString());

  } catch (error) {
    console.error('❌ Error creating wallet:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createUserWallet();
