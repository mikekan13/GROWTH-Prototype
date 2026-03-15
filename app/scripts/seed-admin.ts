/**
 * Seed the admin (ADMIN) user.
 * Usage: npx tsx scripts/seed-admin.ts
 */
import { prisma } from '../src/lib/db';
import bcrypt from 'bcryptjs';

async function main() {
  const username = 'Mikekan13';
  const email = 'admin@growth.local';
  const password = 'admin';
  const role = 'ADMIN';

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  });

  if (existing) {
    console.log(`User "${existing.username}" already exists (role: ${existing.role}). Skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: { username, email, passwordHash, role },
    });

    await tx.wallet.create({
      data: { ownerId: newUser.id, ownerType: 'USER', balance: 0 },
    });

    return newUser;
  });

  console.log(`Created ADMIN user: ${user.username} (id: ${user.id})`);
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
