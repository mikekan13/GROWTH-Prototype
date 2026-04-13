import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/db';

async function main() {
  const hash = await bcrypt.hash('testplayer123', 12);
  const user = await prisma.user.create({
    data: {
      username: 'ClaudePlayer',
      email: 'claude@test.local',
      passwordHash: hash,
      role: 'TRAILBLAZER',
    },
  });
  console.log('Created user:', user.id, user.username, user.role);

  const member = await prisma.campaignMember.create({
    data: {
      campaignId: 'cmmr6djjy0000ws482a52nc1y',
      userId: user.id,
      status: 'INTERESTED',
    },
  });
  console.log('Expressed interest:', member.id, member.status);

}

main().catch(e => { console.error(e); process.exit(1); });
