import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { readClientStore, writeClientStore } from './client-store';

const tmpPaths: string[] = [];

function tmpStorePath(): string {
  const p = path.join(os.tmpdir(), `daya-client-store-test-${Math.random().toString(36).slice(2)}.json`);
  tmpPaths.push(p);
  return p;
}

afterEach(async () => {
  while (tmpPaths.length) {
    const p = tmpPaths.pop();
    if (!p) continue;
    await fs.rm(p, { force: true }).catch(() => undefined);
  }
});

describe('client-store (T15 sovereignty stub)', () => {
  it('reads an empty record when no file exists yet', async () => {
    const p = tmpStorePath();
    const record = await readClientStore(p);
    expect(record).toEqual({});
  });

  it('round-trips a value through write then read', async () => {
    const p = tmpStorePath();
    await writeClientStore({ mood: 'fine', note: 'test value' }, p);
    const record = await readClientStore(p);
    expect(record).toEqual({ mood: 'fine', note: 'test value' });
  });

  it('overwrites on a second write (not a merge)', async () => {
    const p = tmpStorePath();
    await writeClientStore({ a: 1 }, p);
    await writeClientStore({ b: 2 }, p);
    const record = await readClientStore(p);
    expect(record).toEqual({ b: 2 });
  });

  it('creates the containing directory on first write', async () => {
    const dir = path.join(os.tmpdir(), `daya-client-store-dir-${Math.random().toString(36).slice(2)}`);
    const p = path.join(dir, 'store.json');
    tmpPaths.push(p);
    await writeClientStore({ ok: true }, p);
    const record = await readClientStore(p);
    expect(record).toEqual({ ok: true });
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  });
});
