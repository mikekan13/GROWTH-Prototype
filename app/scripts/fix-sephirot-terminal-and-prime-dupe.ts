import { prisma } from '../src/lib/db';
import { createLocation, setLocationParent } from '../src/services/location';

const PRIME = 'cmpll9z3p0000j048aqbgx3vi';
const DUPE = 'cmpdpkcgf0000as486a9zr872';
const SEPHIROT = ['Malkuth', 'Yesod', 'Hod', 'Netzach', 'Tiphareth', 'Geburah', 'Chesed', 'Binah', 'Chokmah', 'Keter'];

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, role: true, username: true } });
  if (!admin) throw new Error('No ADMIN user found');
  console.log(`ADMIN: ${admin.username} (${admin.id})`);

  // 1. The Terminal (r-2026-06-11-03): create if missing, root-level.
  let terminal = await prisma.location.findFirst({ where: { campaignId: PRIME, name: 'The Terminal' } });
  if (!terminal) {
    terminal = await createLocation(PRIME, admin.id, admin.role, {
      name: 'The Terminal',
      description: 'The Terminal tower — the AEON’s consciousness. Houses the 10 Sephirot. The Tree of Life is the only portal in.',
    } as never);
    console.log(`Created The Terminal: ${terminal.id}`);
  } else {
    console.log(`The Terminal exists: ${terminal.id}`);
  }

  // 2. Re-parent the 10 Sephirot located_at -> The Terminal.
  for (const name of SEPHIROT) {
    const loc = await prisma.location.findFirst({ where: { campaignId: PRIME, name } });
    if (!loc) { console.log(`  MISSING: ${name}`); continue; }
    await setLocationParent(PRIME, admin.id, admin.role, loc.id, terminal.id);
    console.log(`  ${name} -> The Terminal`);
  }

  // 3. Retire the duplicate "The Prime Campaign" (r-2026-06-11-04).
  const dupe = await prisma.campaign.findUnique({ where: { id: DUPE }, select: { id: true, name: true } });
  if (dupe) {
    const charIds = (await prisma.character.findMany({ where: { campaignId: DUPE }, select: { id: true } })).map(c => c.id);
    await prisma.$transaction([
      prisma.characterBackstory.deleteMany({ where: { characterId: { in: charIds } } }),
      prisma.wallet.deleteMany({ where: { characterId: { in: charIds } } }),
      prisma.changeLog.deleteMany({ where: { characterId: { in: charIds } } }),
      prisma.portraitGeneration.deleteMany({ where: { characterId: { in: charIds } } }),
      prisma.personaLock.deleteMany({ where: { characterId: { in: charIds } } }),
      prisma.character.deleteMany({ where: { campaignId: DUPE } }),
      prisma.campaignMember.deleteMany({ where: { campaignId: DUPE } }),
      prisma.campaignApplication.deleteMany({ where: { campaignId: DUPE } }),
      prisma.changeLog.deleteMany({ where: { campaignId: DUPE } }),
      prisma.gameSession.deleteMany({ where: { campaignId: DUPE } }),
      prisma.campaignEvent.deleteMany({ where: { campaignId: DUPE } }),
      prisma.copilotMessage.deleteMany({ where: { campaignId: DUPE } }),
      prisma.entityRelationship.deleteMany({ where: { campaignId: DUPE } }),
      prisma.forgeItem.deleteMany({ where: { campaignId: DUPE } }),
      prisma.playerRequest.deleteMany({ where: { campaignId: DUPE } }),
      prisma.campaignItem.deleteMany({ where: { campaignId: DUPE } }),
      prisma.goal.deleteMany({ where: { campaignId: DUPE } }),
      prisma.godHeadMessage.deleteMany({ where: { campaignId: DUPE } }),
      prisma.historyEntry.deleteMany({ where: { campaignId: DUPE } }),
      prisma.timescale.deleteMany({ where: { campaignId: DUPE } }),
      prisma.location.deleteMany({ where: { campaignId: DUPE } }),
      prisma.campaign.delete({ where: { id: DUPE } }),
    ]);
    console.log(`Retired duplicate campaign "${dupe.name}" (${DUPE})`);
  } else {
    console.log('Duplicate campaign already gone');
  }
}

main().finally(() => prisma.$disconnect());
