/**
 * Apply one migration's SQL through the app's own Prisma client (which waits on SQLite's lock while the dev server
 * runs), then record it in _prisma_migrations so `prisma migrate` agrees. Usage (from app/):
 *   npx tsx ../tmp/apply-migration.ts 20261025194648_daya_intentions
 */
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { prisma } from '../app/src/lib/db';

async function main() {
  const name = process.argv[2];
  if (!name) throw new Error('migration name required');
  const sql = readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf-8');
  const statements = sql.split(/;\s*\n/).map((s) => s.replace(/^--.*$/gm, '').trim()).filter(Boolean);
  const done = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(`SELECT migration_name FROM _prisma_migrations WHERE migration_name = '${name}' AND finished_at IS NOT NULL`);
  if (done.length) { console.log('already applied'); return; }
  for (const st of statements) {
    for (let attempt = 1; ; attempt++) {
      try { await prisma.$executeRawUnsafe(st); break; }
      catch (e) { if (attempt >= 20 || !/locked|busy/i.test(String(e))) throw e; await new Promise((r) => setTimeout(r, 500)); }
    }
    console.log('ok:', st.split('\n')[0].slice(0, 90));
  }
  const checksum = createHash('sha256').update(sql).digest('hex');
  await prisma.$executeRawUnsafe(
    `DELETE FROM _prisma_migrations WHERE migration_name = '${name}'`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES ('${randomUUID()}', '${checksum}', CURRENT_TIMESTAMP, '${name}', NULL, NULL, CURRENT_TIMESTAMP, ${statements.length})`,
  );
  console.log('recorded', name);
}
main().finally(() => prisma.$disconnect());
