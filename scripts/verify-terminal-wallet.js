const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyTerminalWallet() {
  try {
    const wallet = await prisma.wallet.findUnique({
      where: {
        ownerType_ownerRef: {
          ownerType: 'TERMINAL',
          ownerRef: 'The Terminal'
        }
      }
    });

    if (wallet) {
      console.log('✅ The Terminal Wallet Found:');
      console.log('===========================================');
      console.log('Owner Type:', wallet.ownerType);
      console.log('Owner Ref:', wallet.ownerRef);
      console.log('Liquid KRMA:', wallet.liquid.toLocaleString(), 'KRMA');
      console.log('Crystalized KRMA:', wallet.crystalized.toLocaleString(), 'KRMA');
      console.log('Total KRMA:', (wallet.liquid + wallet.crystalized).toLocaleString(), 'KRMA');
      console.log('===========================================');
      console.log('💎 This is the complete KRMA supply - 100 billion tokens');
    } else {
      console.log('❌ The Terminal wallet not found');
    }

  } catch (error) {
    console.error('Error verifying wallet:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyTerminalWallet();
