import crypto from 'crypto';
import { prisma } from '../src/lib/db';

async function main() {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.session.create({
    data: {
      userId: 'cmnwdbkvn0000os48x6o2qulm',
      token,
      expiresAt,
    },
  });

  console.log('ClaudePlayer session created');
  console.log('Token:', token);
  console.log('');
  console.log('To use: open browser console and run:');
  console.log(`document.cookie = "session_token=${token}; path=/";`);
  console.log('Then navigate to: http://localhost:3000/trailblazer');
}

main().catch(e => { console.error(e); process.exit(1); });
