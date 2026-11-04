import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
const E = 'cmw1zd27w00l0v848z3pcimp5'; // Rosemary Marsh's DayaEntity, made 2026-11-04T10:35Z in session 5; the rollback leaves beings alone
const p = prisma as any;
async function main() {
  const mem = await p.dayaMemoryEntry.deleteMany({ where: { entityId: E } }).catch(() => ({ count: -1 }));
  const intent = await p.dayaIntention.deleteMany({ where: { entityId: E } }).catch(() => ({ count: -1 }));
  await p.dayaEntity.delete({ where: { id: E } });
  console.log('rosemary unseated: memories', mem.count, 'intentions', intent.count);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
