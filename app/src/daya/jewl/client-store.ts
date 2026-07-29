/**
 * T15 tap — client-side private store stub (Addendum B3: sovereignty is
 * literal — the OOC/wellbeing store belongs to the human, not the campaign).
 *
 * Phase 1 establishes the INTERFACE SEAM only: a local-file-backed
 * read/write pair against a path that is never committed (see `.gitignore`
 * — the default path lives under `.local/`, a directory reserved for
 * user-owned, non-campaign, non-repo data). A full client app is out of
 * scope for Phase 1; this is what a future one would read/write through.
 *
 * `entityId`-agnostic on purpose — this store is keyed by whatever the
 * eventual client decides (character/user/session), not by the persona
 * harness's own id space. Phase 1 callers pass a flat record; shape is
 * intentionally unopinionated.
 */
import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';

export type ClientStoreRecord = Record<string, unknown>;

const DEFAULT_STORE_PATH = path.join(process.cwd(), '.local', 'daya-client-store.json');

function resolveStorePath(customPath?: string): string {
  return customPath ?? process.env.DAYA_CLIENT_STORE_PATH ?? DEFAULT_STORE_PATH;
}

/** Reads the local client store. Missing file = empty record, not an error
 * (nothing has been written yet is the expected first-run state). */
export async function readClientStore(storePath?: string): Promise<ClientStoreRecord> {
  const target = resolveStorePath(storePath);
  try {
    const raw = await fs.readFile(target, 'utf-8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as ClientStoreRecord) : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

/** Overwrites the local client store with `record`. Creates the containing
 * directory if needed (first-run). */
export async function writeClientStore(record: ClientStoreRecord, storePath?: string): Promise<void> {
  const target = resolveStorePath(storePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(record, null, 2), 'utf-8');
}

// ── Legal-mandate handler seam (Addendum B3) — DO NOT BUILD IN PHASE 1 ────
// NEEDS-MIKE / legal: a jurisdictional-review-gated, access-logged module
// would attach HERE, reading from this same store under an actual legal
// mandate (a lawyer-scoped review, not an engineering task). Phase 1 leaves
// only this seam — no code path exists that reads this store except the
// owning client itself.
// export async function legalMandateRead(...): Promise<never> { throw new Error('not implemented — requires legal review'); }
