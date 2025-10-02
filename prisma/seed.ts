/**
 * Database Seed Script
 * Creates initial admin user for development
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create admin user
  const adminEmail = 'mikekan13@gmail.com';
  const adminUsername = 'mikekan13';
  const adminPassword = 'admin123'; // Change this after first login!

  const existingAdmin = await prisma.user.findFirst({
    where: {
      OR: [
        { email: adminEmail },
        { username: adminUsername },
      ],
    },
  });

  if (existingAdmin) {
    console.log('✓ Admin user already exists');
    return;
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.create({
    data: {
      username: adminUsername,
      email: adminEmail,
      password: hashedPassword,
      name: 'Mike',
      role: 'ADMIN',
    },
  });

  console.log(`✓ Created admin user: ${admin.username} (${admin.email})`);
  console.log(`  Password: ${adminPassword}`);
  console.log('  ⚠️  IMPORTANT: Change this password after first login!');
  console.log('');
  console.log('🎉 Database seeded successfully!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Start the dev server: pnpm dev:clean');
  console.log('2. Go to http://localhost:3000/login');
  console.log(`3. Login with username: ${adminUsername} and password: ${adminPassword}`);
  console.log('4. Generate GM invite codes at /admin/invite-codes');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
