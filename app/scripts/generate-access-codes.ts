/**
 * Generate access codes for testing/distribution.
 * Usage: npx tsx scripts/generate-access-codes.ts [count] [label]
 * Example: npx tsx scripts/generate-access-codes.ts 5 "Alpha Tester"
 */
import { prisma } from '../src/lib/db';
import crypto from 'crypto';

async function main() {
  const count = parseInt(process.argv[2] || '1');
  const label = process.argv[3] || null;

  console.log(`Generating ${count} WATCHER access code(s)...`);

  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const accessCode = await prisma.accessCode.create({
      data: { code, role: 'WATCHER', label },
    });
    console.log(`  ${accessCode.code}${label ? ` (${label})` : ''}`);
  }

  console.log('\nDone. Codes can be redeemed at registration or via /api/access-codes/redeem');
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
