const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function initializeReserveWallets() {
  console.log('🏦 Initializing KRMA Reserve Wallet - The Terminal...');

  try {
    // Create The Terminal reserve wallet with all 100 billion KRMA
    const terminalReserve = {
      ownerType: 'TERMINAL',
      ownerRef: 'The Terminal',
      liquid: BigInt(100000000000), // 100B KRMA (100 billion - total supply)
      crystalized: BigInt(0),
    };

    // Check if wallet already exists
    const existing = await prisma.wallet.findFirst({
      where: {
        ownerType: terminalReserve.ownerType,
        ownerRef: terminalReserve.ownerRef,
      },
    });

    if (existing) {
      console.log(`💰 The Terminal wallet already exists with ${existing.liquid.toLocaleString()} KRMA`);
      console.log(`   Crystalized: ${existing.crystalized.toLocaleString()} KRMA`);
      console.log(`   Total: ${(existing.liquid + existing.crystalized).toLocaleString()} KRMA`);
    } else {
      await prisma.wallet.create({
        data: terminalReserve,
      });
      console.log(`✅ Created The Terminal reserve wallet with ${terminalReserve.liquid.toLocaleString()} KRMA`);
      console.log(`   This is the complete KRMA supply - 100 billion tokens`);
    }

    console.log('🎉 Reserve wallet initialization complete!');
  } catch (error) {
    console.error('❌ Error initializing reserve wallet:', error);
  } finally {
    await prisma.$disconnect();
  }
}

initializeReserveWallets();