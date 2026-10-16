/**
 * Violet's three published novels become WORLDS (2026-10-16,
 * ruling-novels-are-worlds §5): one session-0 campaign each in Mike's list,
 * the book on "The reading corner shelf" the doorway. Idempotent.
 *   npx tsx scripts/create-violet-novel-worlds.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { createNovelWorld } from '../src/services/novel-worlds';

const VIOLET = 'cms60ndtn0000kw48ioq10i68';
const MIKE = { id: 'cmrep1oh300002g48ue1bn5rg', role: 'ADMIN' };
const TITLES = ['The Ashwood Crown', 'The Salt and the Star', 'What the River Kept'];
const SHELF = 'The reading corner shelf';

async function main() {
  for (const title of TITLES) {
    const r = await createNovelWorld(MIKE, { authorCharacterId: VIOLET, title, shelfLocation: SHELF });
    console.log(`${r.created ? 'created' : 'exists '}  «${r.title}»  item ${r.itemId}  → campaign ${r.campaignId}`);
  }
  await new Promise(r => setTimeout(r, 1500)); // let fire-and-forget provenance writes land
}
main().finally(async () => { await prisma.$disconnect(); process.exit(process.exitCode ?? 0); });
