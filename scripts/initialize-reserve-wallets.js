const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function initializeReserveWallets() {
  console.log('🏦 Initializing KRMA Reserve Wallets...');

  try {
    // Create reserve wallets with proper amounts
    const reserves = [
      {
        ownerType: 'TERMINAL',
        ownerRef: 'TERMINAL',
        liquid: BigInt(50000000), // 50M KRMA
        crystalized: BigInt(0),
      },
      {
        ownerType: 'TERMINAL',
        ownerRef: 'MERCY',
        liquid: BigInt(20000000), // 20M KRMA
        crystalized: BigInt(0),
      },
      {
        ownerType: 'TERMINAL',
        ownerRef: 'BALANCE',
        liquid: BigInt(20000000), // 20M KRMA
        crystalized: BigInt(0),
      },
      {
        ownerType: 'TERMINAL',
        ownerRef: 'SEVERITY',
        liquid: BigInt(10000000), // 10M KRMA
        crystalized: BigInt(0),
      }
    ];

    for (const reserve of reserves) {
      // Check if wallet already exists
      const existing = await prisma.wallet.findFirst({
        where: {
          ownerType: reserve.ownerType,
          ownerRef: reserve.ownerRef,
        },
      });

      if (existing) {
        console.log(`💰 ${reserve.ownerRef} wallet already exists with ${existing.liquid} KRMA`);
      } else {
        await prisma.wallet.create({
          data: reserve,
        });
        console.log(`✅ Created ${reserve.ownerRef} reserve wallet with ${reserve.liquid} KRMA`);
      }
    }

    console.log('🎉 Reserve wallets initialization complete!');
  } catch (error) {
    console.error('❌ Error initializing reserve wallets:', error);
  } finally {
    await prisma.$disconnect();
  }
}

initializeReserveWallets();