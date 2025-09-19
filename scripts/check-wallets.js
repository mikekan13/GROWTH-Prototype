const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkWallets() {
  console.log('🔍 Checking existing wallets...');

  try {
    const wallets = await prisma.wallet.findMany();
    console.log('All wallets:');
    console.log(JSON.stringify(wallets, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    , 2));

    // Specifically check for Terminal wallet
    const terminalWallet = await prisma.wallet.findFirst({
      where: {
        ownerType: 'TERMINAL',
        ownerRef: 'TERMINAL',
      },
    });

    console.log('\nTerminal wallet lookup:');
    console.log(terminalWallet ? JSON.stringify(terminalWallet, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    , 2) : 'NOT FOUND');

  } catch (error) {
    console.error('❌ Error checking wallets:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkWallets();