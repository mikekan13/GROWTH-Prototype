import { PrismaClient } from '@/generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import type { Client, Config } from '@libsql/client';
import path from 'path';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/** How long a writer waits for a lock held by ANOTHER process (the U2 harness,
 *  a seed script) before SQLite gives up with BUSY. Inside one process the
 *  adapter already serialises every query behind a mutex, so this only ever
 *  matters across processes. */
const BUSY_TIMEOUT_MS = 5000;

/**
 * libsql's file client sets no busy timeout at all (the native binding
 * defaults to 0 ms), so two processes writing dev.db collided instantly and
 * Prisma reported "Operation has timed out" (2026-10-06, U2 live run).
 *
 * The client also hands its native connection to every transaction() and
 * lazily opens a NEW one for the next call — a one-off PRAGMA through Prisma
 * is lost after the first transaction. So every fresh connection is primed
 * here, before its first statement:
 *   - PRAGMA busy_timeout       → wait instead of fail (cross-process only)
 *   - PRAGMA journal_mode=WAL   → readers never block on a writer; persisted
 *                                 in the file, so it is checked once per client
 *                                 and re-tried only if it did not take.
 * Measured on a copy, two processes × 200 transactions: rollback + 0 ms gave
 * 4/200; WAL + 5000 ms gave 200/200 with a worst wait under a second.
 *
 * Failures are loud: a PRAGMA error is logged once with its cause and then
 * re-thrown, so an adapter upgrade that changes connection handling shows up
 * instead of silently reverting to fail-fast.
 */
class GrowthLibSql extends PrismaLibSql {
  createClient(config: Config): Client {
    const client = super.createClient(config);
    const exec = client.execute.bind(client);
    const batch = client.batch.bind(client);
    const transaction = client.transaction.bind(client);
    const executeMultiple = client.executeMultiple.bind(client);

    let fresh = true; // the next statement runs on a connection we have not primed
    let walConfirmed = false;
    let warned = false;

    const prime = async () => {
      if (!fresh) return;
      fresh = false;
      try {
        await exec(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS}`);
        if (!walConfirmed) {
          const rs = await exec('PRAGMA journal_mode=WAL');
          const mode = String(rs.rows[0]?.journal_mode ?? rs.rows[0]?.[0] ?? '').toLowerCase();
          if (mode === 'wal') {
            walConfirmed = true;
          } else if (!warned) {
            // Not an error from SQLite: the switch needs a moment with no other
            // connection mid-transaction. Retried on the next fresh connection.
            warned = true;
            console.error(`[db] PRAGMA journal_mode=WAL did not take (got "${mode}"); concurrent reads can still block on a writer until it does.`);
          }
        }
      } catch (err) {
        if (!warned) {
          warned = true;
          console.error('[db] SQLite connection priming failed; concurrent writes will fail fast instead of waiting:', err);
        }
        throw err;
      }
    };

    client.execute = (async (...args: Parameters<Client['execute']>) => {
      await prime();
      return exec(...args);
    }) as Client['execute'];
    client.batch = (async (...args: Parameters<Client['batch']>) => {
      await prime();
      return batch(...args);
    }) as Client['batch'];
    client.executeMultiple = async (sql: string) => {
      await prime();
      return executeMultiple(sql);
    };
    client.transaction = (async (...args: Parameters<Client['transaction']>) => {
      await prime();
      const tx = await transaction(...args);
      fresh = true; // the client lazily opens a new connection after handing this one to the tx
      return tx;
    }) as Client['transaction'];
    return client;
  }
}

function createPrismaClient() {
  const dbPath = path.join(process.cwd(), 'dev.db');
  const adapter = new GrowthLibSql({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
