import { prisma } from '../src/lib/db';

/**
 * Phase 1 — create Tara's three cosmic possessions as Location records
 * in the Prime campaign, then connect them to her via EntityRelationship
 * rows with relationshipType='owns' and KRMA value in the data JSON.
 *
 * Idempotent: if a Location with the same name already exists in the
 * Prime campaign, we reuse it; ditto for the relationships.
 */

const POSSESSIONS = [
  {
    name: 'Tree of Life',
    type: 'cosmic_landmark', // extension to the existing Location.type vocabulary
    krmaValue: 1_500_000,
    note:
      'The Tower of Sephirot. Endgame venue of the Prime campaign. Tara oversees as Lady Death + Maiden of the Library.',
    data: {
      description:
        'The Tower of Sephirot. Ten Sephirot rooms, no revisits, Wyatt at the door, Roys observing the entrance. The True Ending realization happens at the top.',
      cosmicTier: true,
    },
  },
  {
    name: 'River Styx',
    type: 'cosmic_landmark',
    krmaValue: 1_200_000,
    note:
      "Tara's domain. The river of erasure where Vincent was unmade (Thomas's God-Killer Gun option 3 / Styx-erasure property).",
    data: {
      description:
        'The river of erasure. Banishment-tier mechanic distinct from death. Souls that pass here lose continuity entirely.',
      cosmicTier: true,
    },
  },
  {
    name: 'Undead Army',
    type: 'force',
    krmaValue: 2_500_000,
    note:
      'Tara\'s standing necromantic force. Mostly dormant in current Prime; can be deployed for council-tier interventions.',
    data: {
      description:
        'A massive standing army of the undead under Lady Death\'s command. Mostly dormant in current Prime; activates for cosmic-scale interventions.',
      cosmicTier: true,
    },
  },
];

(async () => {
  const tara = await prisma.character.findFirst({
    where: { name: 'Tara Almswood' },
    select: { id: true, campaignId: true, userId: true },
  });
  if (!tara) {
    console.log('Tara not found — aborting');
    await prisma.$disconnect();
    return;
  }
  if (!tara.campaignId) {
    console.log('Tara has no campaignId — aborting');
    await prisma.$disconnect();
    return;
  }

  for (const p of POSSESSIONS) {
    // 1. Find or create the Location for this possession
    let location = await prisma.location.findFirst({
      where: { campaignId: tara.campaignId, name: p.name },
      select: { id: true, name: true, type: true },
    });
    if (!location) {
      location = await prisma.location.create({
        data: {
          campaignId: tara.campaignId,
          name: p.name,
          type: p.type,
          data: JSON.stringify(p.data),
          status: 'ACTIVE',
          createdBy: tara.userId,
        },
        select: { id: true, name: true, type: true },
      });
      console.log(`  + Location created: ${location.name} (${location.type}) [${location.id}]`);
    } else {
      console.log(`  · Location exists: ${location.name} (${location.type}) [${location.id}]`);
    }

    // 2. Find or create the EntityRelationship: Tara owns this Location
    const existingRel = await prisma.entityRelationship.findFirst({
      where: {
        sourceId: tara.id,
        targetId: location.id,
        relationshipType: 'owns',
      },
      select: { id: true },
    });
    const relData = JSON.stringify({ krmaValue: p.krmaValue, note: p.note });
    if (!existingRel) {
      const rel = await prisma.entityRelationship.create({
        data: {
          campaignId: tara.campaignId,
          sourceId: tara.id,
          sourceType: 'CHARACTER',
          targetId: location.id,
          targetType: 'LOCATION',
          relationshipType: 'owns',
          strength: 10,
          bidirectional: false,
          data: relData,
        },
        select: { id: true },
      });
      console.log(`    + EntityRelationship created [${rel.id}] krmaValue=${p.krmaValue.toLocaleString()}`);
    } else {
      await prisma.entityRelationship.update({
        where: { id: existingRel.id },
        data: { data: relData, strength: 10 },
      });
      console.log(`    · EntityRelationship exists, data refreshed [${existingRel.id}] krmaValue=${p.krmaValue.toLocaleString()}`);
    }
  }

  // 3. Summary readback
  const summary = await prisma.entityRelationship.findMany({
    where: { sourceId: tara.id, relationshipType: 'owns' },
    select: { id: true, targetId: true, targetType: true, data: true },
  });
  console.log(`\n=== Tara now owns ${summary.length} entities ===`);
  for (const r of summary) {
    const target = r.targetType === 'LOCATION'
      ? await prisma.location.findUnique({ where: { id: r.targetId }, select: { name: true, type: true } })
      : null;
    const parsedData = (() => { try { return r.data ? JSON.parse(r.data) : {}; } catch { return {}; } })();
    console.log(`  - ${target?.name ?? '(unknown target)'} (${target?.type ?? r.targetType}) — ${(parsedData.krmaValue ?? 0).toLocaleString()} Ҝ`);
  }

  await prisma.$disconnect();
})();
