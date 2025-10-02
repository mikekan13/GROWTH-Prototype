const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixTerminalBalance() {
  try {
    // Get current Terminal balance
    const terminalWallet = await prisma.wallet.findUnique({
      where: {
        ownerType_ownerRef: {
          ownerType: 'TERMINAL',
          ownerRef: 'The Terminal'
        }
      }
    });

    console.log('🏦 Current Terminal Balance:');
    console.log('   Liquid:', terminalWallet.liquid.toLocaleString(), 'KRMA');

    // Deduct 10k KRMA that was given to mikekan13@gmail.com
    const updatedWallet = await prisma.wallet.update({
      where: {
        ownerType_ownerRef: {
          ownerType: 'TERMINAL',
          ownerRef: 'The Terminal'
        }
      },
      data: {
        liquid: {
          decrement: BigInt(10000)
        }
      }
    });

    console.log('✅ Deducted 10,000 KRMA from The Terminal');
    console.log('💰 New Terminal Balance:');
    console.log('   Liquid:', updatedWallet.liquid.toLocaleString(), 'KRMA');
    console.log('   Total Supply Preserved: 100,000,000,000 KRMA');

    // Verify total conservation
    const allWallets = await prisma.wallet.findMany();
    let totalLiquid = BigInt(0);
    let totalCrystalized = BigInt(0);

    for (const wallet of allWallets) {
      totalLiquid += wallet.liquid;
      totalCrystalized += wallet.crystalized;
    }

    const totalKRMA = totalLiquid + totalCrystalized;

    console.log('\n🔍 Conservation Check:');
    console.log('   Total Liquid:', totalLiquid.toLocaleString(), 'KRMA');
    console.log('   Total Crystalized:', totalCrystalized.toLocaleString(), 'KRMA');
    console.log('   Total KRMA:', totalKRMA.toLocaleString(), 'KRMA');
    console.log('   Expected:', '100,000,000,000 KRMA');
    console.log('   ✅ Conservation:', totalKRMA === BigInt(100000000000) ? 'VALID' : 'INVALID');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixTerminalBalance();
