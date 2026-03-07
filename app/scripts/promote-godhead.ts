// Run with: npx tsx scripts/promote-godhead.ts <username>
// Promotes a user to GODHEAD role

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import path from 'path';

const dbPath = path.join(process.cwd(), 'dev.db');
const adapter = new PrismaLibSql({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error('Usage: npx tsx scripts/promote-godhead.ts <username>');
    process.exit(1);
  }

  const user = await prisma.user.update({
    where: { username },
    data: { role: 'GODHEAD' },
  });

  console.log(`Promoted ${user.username} (${user.email}) to GODHEAD`);
}

main().catch(console.error);
