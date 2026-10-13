/** Revoke a session by token. Usage: npx tsx scripts/revoke-session.ts <token> */
import { prisma } from '../src/lib/db';

async function main() {
  const token = process.argv[2];
  if (!token) throw new Error('usage: revoke-session.ts <token>');
  const r = await prisma.session.deleteMany({ where: { token } });
  console.log(JSON.stringify({ revoked: r.count }));
}

main().catch((e) => { console.error(e); process.exit(1); });
