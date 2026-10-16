/**
 * Organize Violet's studio in ONE applyLayout call (2026-10-16): the layout
 * as it stands on the map, room descriptions written FROM the map (present
 * tense, concrete — the truth of the place, not her impression), derived
 * placement facts, and the old contradicting / orphaned facts superseded.
 * Does NOT create the mug or the three novels — Mike writes those.
 *   npx tsx scripts/organize-violet-studio.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { applyLayout } from '../src/services/placement';

const CHARACTER_ID = 'cms60ndtn0000kw48ioq10i68';
const CAMPAIGN_ID = 'cms5z4j6z0000zg48z5vzl2jn';
const HOME = "Violet's Apartment — Fourth-Floor Walkup Studio";
const PREFIX = 'violet_apartment';

async function main() {
  const c = await prisma.character.findUnique({ where: { id: CHARACTER_ID }, select: { name: true, campaignId: true } });
  if (c?.campaignId !== CAMPAIGN_ID) throw new Error(`Character ${CHARACTER_ID} is not in campaign ${CAMPAIGN_ID}`);
  const campaign = await prisma.campaign.findUnique({ where: { id: CAMPAIGN_ID }, select: { gmUserId: true } });
  if (!campaign) throw new Error('Campaign not found');
  const gm = await prisma.user.findUnique({ where: { id: campaign.gmUserId }, select: { id: true, role: true } });
  if (!gm) throw new Error('GM user not found');

  // The three novels are Mike's to author (never created here). When they
  // already exist on the map they are placed on the shelf and described;
  // until then the old novel facts are closed.
  const NOVELS = ['The Ashwood Crown', 'The Salt and the Star', 'What the River Kept'];
  const novelRows = await prisma.campaignItem.findMany({ where: { campaignId: CAMPAIGN_ID, status: 'ACTIVE', name: { in: NOVELS } }, select: { name: true } });
  const novels = NOVELS.filter(n => novelRows.some(r => r.name === n));
  const novelsOnShelf = novels.length > 0;
  const novelList = novels.join(', ').replace(/, ([^,]*)$/, ' and $1');

  const report = await applyLayout(CAMPAIGN_ID, { userId: gm.id, role: gm.role }, {
    factPrefix: PREFIX,
    rooms: [
      { name: 'Main Room', parent: HOME },
      { name: 'Kitchenette', parent: HOME },
      { name: 'Bathroom', parent: HOME },
    ],
    // Containers into rooms first, then contents into containers.
    placements: [
      { item: 'The reading corner shelf', into: 'Main Room' },
      { item: 'The desk under the window', into: 'Main Room' },
      { item: 'The green couch', into: 'Main Room' },
      { item: 'The laundry basket', into: 'Main Room' },
      { item: 'The story board', into: 'Main Room' },
      { item: 'The mended rabbit', into: 'The reading corner shelf' },
      { item: 'Vanilla candles', into: 'The reading corner shelf' },
      ...novels.map(n => ({ item: n, into: 'The reading corner shelf' })),
      { item: 'Her writing machine', into: 'The desk under the window' },
      { item: 'The desk lamp', into: 'The desk under the window' },
      { item: 'The reincarnation book', into: 'The desk under the window' },
      { item: 'The rust blanket', into: 'The green couch' },
      { item: "Rosemary's sewing box", into: 'Kitchenette' },
      { item: "Rosemary's recipes", into: 'Kitchenette' },
    ],
    descriptions: [
      {
        location: HOME,
        description:
          'Pre-war studio on the fourth floor of a five-story walkup in the historic district, ~420–460 sq ft, 9.5 ft ceilings. ' +
          'Three rooms: the Main Room (street-facing window, fire escape beyond it, entry door at the rear-left corner), ' +
          'the Kitchenette (galley alcove off the entry along the right wall), and the Bathroom (door on the left wall of the main room). ' +
          'Clean, maintained, lived-in.',
      },
      {
        location: 'Main Room',
        description:
          'The single main room of the studio: living, reading and writing space. ' +
          'The desk under the window stands against the street-facing wall; on it sit her writing machine, the desk lamp and the reincarnation book. ' +
          `The reading corner shelf holds the mended rabbit and the vanilla candles${novelsOnShelf ? `, and her published novels — ${novelList}` : ''}. ` +
          'The green couch anchors the left third of the room, the rust blanket draped over it. ' +
          'The laundry basket stands near the bathroom door. The story board hangs on the wall above the desk. ' +
          'A single steam pipe runs floor to ceiling in the far corner.',
      },
      {
        location: 'Kitchenette',
        description:
          'Galley kitchen alcove off the entry, along the right wall, ~8 ft deep and 5 ft wide: small refrigerator, two-burner stove, sink, a few cabinets, a drip coffee maker on the counter. ' +
          "Rosemary's sewing box and Rosemary's recipes are kept here.",
      },
      {
        location: 'Bathroom',
        description:
          'Small bathroom, door on the left wall of the main room, two-thirds of the way toward the window. ' +
          'White hex-tile floor, aged alcove tub with a wire caddy, pedestal sink, a wooden shelf at eye level, warm-white bulb over the mirror. ' +
          'Nothing of hers is placed here.',
      },
    ],
    // STATE only — placement is derived from the map above. Old facts that
    // named a wrong place are rewritten without the place; facts about things
    // that no longer exist, and duplicate keys, are closed with "(removed)".
    facts: [
      // The rabbit lives on the reading corner shelf (map), not the couch.
      { subjectKey: 'violet_apartment.couch.stuffed_animal', fact: '(removed) The mended rabbit is not on the couch — see violet_apartment.main_room.reading_corner_shelf.mended_rabbit.' },
      // The sewing box is in the Kitchenette (map), not the living corner.
      { subjectKey: 'violet_apartment.sewing_box', fact: "Rosemary's sewing box: compact wooden box. Needles, thread in colors Violet would never choose, small scissors worn smooth at the pivot. Violet has used it twice since inheriting it." },
      // The candles sit on the reading corner shelf (map), not the bathroom.
      { subjectKey: 'violet_apartment.candles', fact: 'Vanilla-scented candles, partly burned, unlit. Two cream wax droplets are fused to the floor near the bathroom door from a previous candle.' },
      { subjectKey: 'violet_apartment.bathroom', fact: 'Small bathroom, door on the left wall two-thirds toward the window. White hex-tile floor with a few cracked tiles, grout gray with age. Aged alcove tub with a wire caddy across it. Wooden shelf at eye level: a face-down paperback and a water glass. Pedestal sink, toothpaste tube rolled from the bottom. Warm-white bulb over the mirror, currently off. Half-open door.' },
      // Things that do not exist on the map (Mike writes the mug and the novels).
      { subjectKey: 'violet_apartment.desk.mug', fact: '(removed) No mug on the desk yet — Mike authors it.' },
      novelsOnShelf
        ? { subjectKey: 'violet_apartment.bookshelf.published_novels', fact: `Violet's published novels, her own copies — ${novelList}. Spines face out. She has not reread any of them. They exist on the shelf the way a diploma exists on a wall — proof, not pleasure.` }
        : { subjectKey: 'violet_apartment.bookshelf.published_novels', fact: '(removed) The three novels are not on the shelf yet — Mike authors them as worlds.' },
      { subjectKey: 'violet_apartment.bookshelf', fact: `The reading corner shelf: freestanding, loaded to capacity with ${novelsOnShelf ? "Violet's published novels, " : ''}fantasy and romance novels, research titles, a few dog-eared paperbacks. No book looks new. Every spine is broken in a different place. A receipt protrudes from one as a bookmark.` },
      { subjectKey: 'violet_apartment.desk', fact: "Solid wood writing desk under the street-facing window — the room's center of gravity. Surface marked by ink stains and cup rings. Secondhand. On it: her writing machine, the desk lamp, the reincarnation book (the unfinished manuscript), a pen or two." },
      // Duplicate keys from the rerun.
      { subjectKey: 'violet_apartment.items.laptop', fact: '(removed) duplicate — see violet_apartment.desk.laptop and violet_apartment.main_room.desk_under_the_window.writing_machine.' },
      { subjectKey: 'violet_apartment.items.manuscript', fact: '(removed) duplicate — see violet_apartment.desk.manuscript and violet_apartment.main_room.desk_under_the_window.reincarnation_book.' },
      { subjectKey: 'violet_apartment.items.recipe_collection', fact: '(removed) duplicate — see violet_apartment.kitchen.recipe_collection and violet_apartment.kitchenette.rosemarys_recipes.' },
      { subjectKey: 'violet_apartment.items.sewing_box', fact: '(removed) duplicate — see violet_apartment.sewing_box and violet_apartment.kitchenette.rosemarys_sewing_box.' },
      { subjectKey: 'violet_apartment.items.stuffed_animal', fact: '(removed) duplicate — see violet_apartment.main_room.reading_corner_shelf.mended_rabbit.' },
    ],
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
