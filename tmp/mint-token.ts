// Mints a fresh 6 h GM session token for the probe scripts and writes it into tmp/gm/state.json (same as tmp/gm.ts does).
import '../app/scripts/_server-only-shim';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { prisma } from '../app/src/lib/db';

async function main() {
const P = 'C:/Projects/GRO.WTH/tmp/gm/state.json';
const st = JSON.parse(fs.readFileSync(P, 'utf8'));
const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, username: true } });
if (!admin) throw new Error('no ADMIN user');
const token = crypto.randomBytes(32).toString('hex');
await prisma.session.create({ data: { userId: admin.id, token, expiresAt: new Date(Date.now() + 6 * 3600_000) } });
st.token = token;
fs.writeFileSync(P, JSON.stringify(st, null, 2));
console.log('minted for', admin.username, 'until', new Date(Date.now() + 6 * 3600_000).toISOString());
await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
