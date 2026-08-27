import { prisma } from '../src/lib/db';

/**
 * Seed the 10 Sephirot rooms as child Locations of Tree of Life,
 * linked via EntityRelationship('located_at'). Notes pulled from v4
 * Final Two Sessions endgame summary in docs/research-tara-almswood.md.
 *
 * Idempotent: if a child Location with the same name already exists in
 * the Prime campaign and is already linked to Tree of Life, we skip.
 */

const ROOMS = [
  { name: 'Malkuth',   gloss: 'Kingdom',        order: 1,  riddle: 'the present moment',                  type: 'cosmic_landmark' },
  { name: 'Yesod',     gloss: 'Foundation',     order: 2,  riddle: 'choice between Power and Wisdom doors', type: 'cosmic_landmark' },
  { name: 'Hod',       gloss: 'Splendor',       order: 3,  riddle: 'magical-feats test',                  type: 'cosmic_landmark' },
  { name: 'Netzach',   gloss: 'Victory',        order: 4,  riddle: 'defeat a corrupted champion',          type: 'cosmic_landmark' },
  { name: 'Tiphareth', gloss: 'Beauty',         order: 5,  riddle: 'produce art',                         type: 'cosmic_landmark' },
  { name: 'Geburah',   gloss: 'Severity',       order: 6,  riddle: 'alternative path (implied)',           type: 'cosmic_landmark' },
  { name: 'Chesed',    gloss: 'Mercy',          order: 7,  riddle: 'sacrifice the wounded for a dud artifact', type: 'cosmic_landmark' },
  { name: 'Binah',     gloss: 'Understanding',  order: 8,  riddle: 'Soul Separation chamber',              type: 'cosmic_landmark' },
  { name: 'Chokmah',   gloss: 'Wisdom',         order: 9,  riddle: 'Soul Mating chamber',                 type: 'cosmic_landmark' },
  { name: 'Keter',     gloss: 'Crown',          order: 10, riddle: 'the Demiurge boss room',              type: 'cosmic_landmark' },
];

(async () => {
  const tree = await prisma.location.findFirst({
    where: { name: 'Tree of Life' },
    select: { id: true, campaignId: true },
  });
  if (!tree) {
    console.log('Tree of Life not found — aborting');
    await prisma.$disconnect();
    return;
  }
  const campaign = await prisma.campaign.findUnique({
    where: { id: tree.campaignId },
    select: { gmUserId: true },
  });
  if (!campaign) {
    console.log('Campaign not found — aborting');
    await prisma.$disconnect();
    return;
  }
  const createdBy = campaign.gmUserId;

  for (const r of ROOMS) {
    let room = await prisma.location.findFirst({
      where: { campaignId: tree.campaignId, name: r.name },
      select: { id: true, name: true, type: true },
    });
    if (!room) {
      room = await prisma.location.create({
        data: {
          campaignId: tree.campaignId,
          name: r.name,
          type: r.type,
          status: 'ACTIVE',
          createdBy,
          data: JSON.stringify({
            description: `Sephirot #${r.order} — ${r.gloss}. ${r.riddle}.`,
            tags: ['sephirot', 'tower-of-sephirot', r.gloss.toLowerCase()],
            sephirotOrder: r.order,
          }),
        },
        select: { id: true, name: true, type: true },
      });
      console.log(`  + Sephirot ${r.order} created: ${room.name} (${r.gloss}) [${room.id}]`);
    } else {
      console.log(`  · Sephirot ${r.order} exists: ${room.name} (${r.gloss}) [${room.id}]`);
    }

    const existingEdge = await prisma.entityRelationship.findFirst({
      where: { sourceId: room.id, targetId: tree.id, relationshipType: 'located_at' },
      select: { id: true },
    });
    const edgeData = JSON.stringify({ position: r.order, note: `${r.gloss} — ${r.riddle}` });
    if (!existingEdge) {
      const edge = await prisma.entityRelationship.create({
        data: {
          campaignId: tree.campaignId,
          sourceId: room.id,
          sourceType: 'LOCATION',
          targetId: tree.id,
          targetType: 'LOCATION',
          relationshipType: 'located_at',
          strength: 5,
          bidirectional: false,
          data: edgeData,
        },
        select: { id: true },
      });
      console.log(`    + located_at edge [${edge.id}]`);
    } else {
      await prisma.entityRelationship.update({
        where: { id: existingEdge.id },
        data: { data: edgeData },
      });
      console.log(`    · located_at edge exists, data refreshed [${existingEdge.id}]`);
    }
  }

  const countInside = await prisma.entityRelationship.count({
    where: { targetId: tree.id, relationshipType: 'located_at' },
  });
  console.log(`\n=== Tree of Life now contains ${countInside} entities ===`);

  await prisma.$disconnect();
})();
