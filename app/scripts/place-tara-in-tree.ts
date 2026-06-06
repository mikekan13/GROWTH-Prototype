/**
 * One-shot data fix: wire Tara Almswood's located_at edge into Tree of Life.
 *
 * Tara is a character sheet; she lives somewhere in the world. Per canon
 * ([[tiberoak-etymology-2026-06-03]]) she guards the Tree of Life — that's
 * where she physically is. Currently no located_at edge exists for her, so
 * the canvas renders her floating at root, ungrounded in space.
 *
 * After this runs:
 *   - entityRelationship row: source=Tara(CHARACTER), target=Tree of Life(LOCATION), type=located_at
 *   - The canvas folder system auto-nests Tara inside Tree of Life
 *
 * Idempotent: skips if the edge already exists. Safe to re-run.
 *
 * River Styx and Undead Army are NOT placed here — they need different
 * primitives (passes_through for the river, faction/membership for the army)
 * that don't exist yet.
 */
import { prisma } from '../src/lib/db';

const CAMPAIGN_NAME = '__PRIME__';
const CHARACTER_NAME = 'Tara Almswood';
const LOCATION_NAME = 'Tree of Life';

async function main() {
  const campaign = await prisma.campaign.findFirst({ where: { name: CAMPAIGN_NAME } });
  if (!campaign) {
    console.error(`Campaign "${CAMPAIGN_NAME}" not found`);
    process.exit(1);
  }

  const character = await prisma.character.findFirst({
    where: { campaignId: campaign.id, name: CHARACTER_NAME },
  });
  if (!character) {
    console.error(`Character "${CHARACTER_NAME}" not found in ${CAMPAIGN_NAME}`);
    process.exit(1);
  }

  const location = await prisma.location.findFirst({
    where: { campaignId: campaign.id, name: LOCATION_NAME },
  });
  if (!location) {
    console.error(`Location "${LOCATION_NAME}" not found in ${CAMPAIGN_NAME}`);
    process.exit(1);
  }

  const existing = await prisma.entityRelationship.findUnique({
    where: {
      sourceId_targetId_relationshipType: {
        sourceId: character.id,
        targetId: location.id,
        relationshipType: 'located_at',
      },
    },
  });
  if (existing) {
    console.log(`located_at edge already exists: ${CHARACTER_NAME} → ${LOCATION_NAME}. No-op.`);
    return;
  }

  await prisma.entityRelationship.create({
    data: {
      campaignId: campaign.id,
      sourceId: character.id,
      sourceType: 'CHARACTER',
      targetId: location.id,
      targetType: 'LOCATION',
      relationshipType: 'located_at',
      strength: 5,
    },
  });
  console.log(`Placed ${CHARACTER_NAME} (${character.id}) inside ${LOCATION_NAME} (${location.id})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => process.exit(0));
