/**
 * Flood the database with test campaigns for feed testing.
 * Usage: npx tsx scripts/seed-flood.ts
 *
 * Creates 20 watchers and 200 campaigns with varied genres, descriptions, and members.
 */
import { prisma } from '../src/lib/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const PASSWORD = 'password';

const GENRES = [
  'Cosmic Horror', 'Cyberpunk', 'Post-Apocalyptic', 'Byzantine Fantasy', 'Southern Gothic',
  'Maritime Adventure', 'Noir', 'Solarpunk', 'Weird West', 'Mythic Realism',
  'Urban Fantasy', 'Space Opera', 'Dieselpunk', 'Folk Horror', 'Sword & Sorcery',
  'Political Thriller', 'Survival Horror', 'Dreamlands', 'Afrofuturism', 'Gothic Romance',
  'Biopunk', 'Steampunk', 'Dark Fantasy', 'Apocalyptic', 'Techno-Thriller',
];

const ADJECTIVES = [
  'Shattered', 'Burning', 'Silent', 'Hollow', 'Crimson', 'Pale', 'Iron', 'Golden',
  'Fading', 'Frozen', 'Sunken', 'Drifting', 'Woven', 'Broken', 'Last', 'First',
  'Bleeding', 'Veiled', 'Starving', 'Drowned', 'Carved', 'Rusted', 'Living', 'Dead',
  'Forgotten', 'Twisted', 'Sacred', 'Profane', 'Fractured', 'Radiant', 'Ashen', 'Gilded',
];

const NOUNS = [
  'Crown', 'Vigil', 'Tide', 'Signal', 'Throne', 'Root', 'Flame', 'Mirror',
  'Gate', 'Covenant', 'Passage', 'Reckoning', 'Chorus', 'Wound', 'Bloom', 'Anchor',
  'Lantern', 'Cipher', 'Harvest', 'Circuit', 'Meridian', 'Furnace', 'Cradle', 'Epoch',
  'Requiem', 'Asylum', 'Labyrinth', 'Oracle', 'Harbinger', 'Remnant', 'Catalyst', 'Nexus',
];

const PREFIXES = [
  'The', 'Project:', 'Operation', 'Protocol:', '', 'Song of the', 'Children of the',
  'Beyond the', 'Beneath the', 'Among the', 'Against the', 'Within the', '',
];

const DESCRIPTIONS = [
  'A world teetering on the edge of collapse, where every choice echoes through dimensions unseen.',
  'Players navigate a society built on lies, where truth is the most dangerous weapon.',
  'In the ruins of civilization, something new is growing — and it has teeth.',
  'Reality is a negotiation. The rules change when no one is watching.',
  'An ancient power stirs beneath the city. The players are the only ones who can hear it breathing.',
  'The war ended. The silence that followed was worse.',
  'Every character carries a secret that could unmake the world. Trust is a luxury.',
  'Exploration of the unknown, where the map is wrong and the compass lies.',
  'A heist across dimensions. The crew is assembled. The target doesn\'t exist yet.',
  'The gods are dying. Their last words are being auctioned to the highest bidder.',
  'In a city where memory is currency, the players are running out of both.',
  'The frontier pushes back. Nature has its own agenda and it\'s not negotiating.',
  'A rebellion without leaders, a revolution without a cause, and a countdown no one can see.',
  'The players wake up in a world that remembers them, but they remember nothing.',
  'Political intrigue in a court where every advisor is also an assassin.',
  'The last ship sails into waters that don\'t appear on any chart.',
  'Technology has outpaced morality. The players are caught in the gap.',
  'A quiet town where nothing happens. Until it does. And then it won\'t stop.',
  'The dead don\'t stay dead here. They come back different. Sometimes better.',
  'An expedition into the deep earth, where the darkness has a vocabulary.',
];

const LISTING_DESCRIPTIONS = [
  'Looking for committed players who enjoy long-form narrative campaigns. Expect moral complexity, character-driven drama, and consequences that ripple.',
  'A collaborative world-building experience. I provide the skeleton, you provide the flesh. Experienced and new players welcome.',
  'Roleplay-heavy, combat-light. Bring a character with depth, not just stats. Sessions run 3-4 hours weekly.',
  'This campaign rewards patience and curiosity. If you like peeling back layers and asking "why" more than "how much damage," this is your table.',
  'New GM here, learning as I go. Looking for patient, enthusiastic players who want to build something weird together.',
  'Hard-mode survival. Resources matter, decisions have weight, and death is permanent. Not for the faint of heart.',
  'Theater of the mind, narrative-first. I don\'t use battle maps. I use tension, pacing, and your imagination.',
  'A sandbox campaign — go where you want, do what you want, face what comes. The world reacts to your choices.',
  'Short campaign arc (8-12 sessions). Tight story, strong themes, definitive ending. Perfect if you can\'t commit to a year-long campaign.',
  'Experimental format: rotating POV sessions, unreliable narrators, and mechanics that shift based on the fiction.',
];

const TAGS_POOL = [
  'horror', 'philosophical', 'long-campaign', 'mature', 'survival', 'exploration',
  'community-building', 'intrigue', 'theological', 'roleplay-heavy', 'cyberpunk',
  'experimental', 'new-gm', 'collaborative', 'combat-heavy', 'sandbox', 'mystery',
  'political', 'narrative', 'short-arc', 'weekly', 'biweekly', 'beginner-friendly',
  'lgbtq-friendly', 'dark-themes', 'world-building', 'character-driven', 'tactical',
];

const WATCHER_NAMES = [
  'Axiom', 'Briar', 'Cinder', 'Deluge', 'Ember_W', 'Forge', 'Gloom', 'Haze',
  'Iris', 'Jinx', 'Knell', 'Loom', 'Moth', 'Null', 'Onyx', 'Prism',
  'Quill', 'Rune', 'Sable', 'Torch',
];

const PLAYER_NAMES = [
  'Ash', 'Blitz', 'Crow', 'Drift', 'Echo', 'Flint', 'Grim', 'Hex',
  'Ivy', 'Jade', 'Knox', 'Luna', 'Mars', 'Neon', 'Opal', 'Pike',
  'Quartz', 'Rift', 'Sage', 'Thorn', 'Umbra', 'Volt', 'Wren', 'Xero',
  'Yew', 'Zinc', 'Alder', 'Birch', 'Clay', 'Dawn', 'Elm', 'Fern',
  'Garnet', 'Heath', 'Indigo', 'Jet', 'Kelp', 'Lark', 'Moss', 'Nettle',
  'Oak', 'Pearl', 'Reed', 'Slate', 'Thistle', 'Umber', 'Vale', 'Wisp',
  'Yarrow', 'Zenith', 'Arrow', 'Basalt', 'Chalk', 'Dune', 'Etch', 'Fjord',
  'Gale', 'Husk', 'Isle', 'Jolt', 'Kite', 'Ledge', 'Mire', 'Nook',
  'Ore', 'Plume', 'Quarry', 'Rust', 'Shard', 'Tuft', 'Urn', 'Verge',
  'Weld', 'Xylem', 'Yoke', 'Zephyr',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function generateName(): string {
  const prefix = pick(PREFIXES);
  const adj = pick(ADJECTIVES);
  const noun = pick(NOUNS);
  const formats = [
    `${prefix} ${adj} ${noun}`,
    `${adj} ${noun}`,
    `The ${adj} ${noun}`,
    `${noun} of the ${adj}`,
    `${adj}${noun}`,
    `${prefix} ${noun}`,
    `${noun}//${adj.toUpperCase()}`,
  ];
  return pick(formats).replace(/\s+/g, ' ').trim();
}

async function main() {
  console.log('Flooding database with test data...\n');

  const hash = await bcrypt.hash(PASSWORD, 10);

  // Create watchers
  console.log('Creating 20 watchers...');
  const watcherIds: Record<string, string> = {};
  for (const name of WATCHER_NAMES) {
    const user = await prisma.user.upsert({
      where: { email: `${name.toLowerCase()}@growth.test` },
      update: {},
      create: {
        id: crypto.randomUUID(),
        username: name,
        email: `${name.toLowerCase()}@growth.test`,
        passwordHash: hash,
        role: 'WATCHER',
        profile: JSON.stringify({ bio: `Experienced Watcher. Runs ${1 + Math.floor(Math.random() * 15)} campaigns and counting.` }),
        watcherProfile: JSON.stringify({ philosophy: pick(LISTING_DESCRIPTIONS), playstyle: pick(DESCRIPTIONS) }),
      },
    });
    watcherIds[name] = user.id;
  }

  // Create players
  console.log('Creating 80 players...');
  const playerIds: Record<string, string> = {};
  for (const name of PLAYER_NAMES) {
    const user = await prisma.user.upsert({
      where: { email: `${name.toLowerCase()}@growth.test` },
      update: {},
      create: {
        id: crypto.randomUUID(),
        username: name,
        email: `${name.toLowerCase()}@growth.test`,
        passwordHash: hash,
        role: 'TRAILBLAZER',
        profile: JSON.stringify({ bio: `Trailblazer exploring the stream. ${Math.floor(Math.random() * 10)} campaigns played.` }),
      },
    });
    playerIds[name] = user.id;
  }

  // Create campaigns
  console.log('Creating 200 campaigns...');
  const usedNames = new Set<string>();
  const allPlayerNames = Object.keys(playerIds);

  for (let i = 0; i < 200; i++) {
    let name = generateName();
    while (usedNames.has(name)) name = generateName();
    usedNames.add(name);

    const gm = pick(WATCHER_NAMES);
    const genre = pick(GENRES);
    const maxTb = 2 + Math.floor(Math.random() * 4); // 2-5
    const memberCount = Math.floor(Math.random() * (maxTb + 1));
    const memberNames = pickN(allPlayerNames, memberCount);
    const tags = pickN(TAGS_POOL, 2 + Math.floor(Math.random() * 4));
    const listed = Math.random() > 0.15; // 85% listed

    const campaign = await prisma.campaign.create({
      data: {
        id: crypto.randomUUID(),
        name,
        genre,
        description: pick(DESCRIPTIONS),
        status: 'ACTIVE',
        maxTrailblazers: maxTb,
        inviteCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
        gmUserId: watcherIds[gm],
        listingStatus: listed ? 'LISTED' : 'UNLISTED',
        listingDescription: listed ? pick(LISTING_DESCRIPTIONS) : null,
        listingTags: listed ? JSON.stringify(tags) : null,
        applicationTemplate: JSON.stringify([
          { id: 'q1', prompt: 'Tell us about your character concept.', required: true, category: 'character' },
          { id: 'q2', prompt: 'What excites you about this campaign?', required: true, category: 'interest' },
        ]),
      },
    });

    // Add members
    for (const playerName of memberNames) {
      await prisma.campaignMember.create({
        data: {
          campaignId: campaign.id,
          userId: playerIds[playerName],
        },
      });
    }

    // Create a character for some members (for TKV data)
    for (const playerName of memberNames) {
      if (Math.random() > 0.3) { // 70% have characters
        const tkv = Math.floor(Math.random() * 500);
        await prisma.character.create({
          data: {
            id: crypto.randomUUID(),
            campaignId: campaign.id,
            userId: playerIds[playerName],
            name: playerName + '\'s Character',
            status: 'ACTIVE',
            data: JSON.stringify({ tkv }),
          },
        });
      }
    }

    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/200 campaigns created...`);
  }

  console.log('\nDone! Created:');
  console.log(`  ${WATCHER_NAMES.length} watchers`);
  console.log(`  ${PLAYER_NAMES.length} players`);
  console.log('  200 campaigns');

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
