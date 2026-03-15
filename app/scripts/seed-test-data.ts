/**
 * Seed test data: Watchers, Trailblazers, Campaigns, Memberships, Applications
 * Usage: npx tsx scripts/seed-test-data.ts
 *
 * All test users have password: "password"
 */
import { prisma } from '../src/lib/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const PASSWORD = 'password';

interface TestUser {
  username: string;
  email: string;
  role: 'WATCHER' | 'TRAILBLAZER';
  profile?: object;
  watcherProfile?: object;
}

const WATCHERS: TestUser[] = [
  {
    username: 'Selva',
    email: 'selva@growth.test',
    role: 'WATCHER',
    profile: { bio: 'Weaver of worlds, student of the hidden pattern. 12 years running tables across systems from PbtA to OSR.' },
    watcherProfile: { philosophy: 'Collaborative storytelling with teeth. Consequences matter.', playstyle: 'Narrative-heavy, theater of the mind, with tactical set pieces.' },
  },
  {
    username: 'Trayman',
    email: 'trayman@growth.test',
    role: 'WATCHER',
    profile: { bio: 'History teacher by day, Watcher by night. Every campaign is a parable.' },
    watcherProfile: { philosophy: 'The game teaches what lectures cannot.', playstyle: 'Slow burn. Long campaigns. Deep character arcs.' },
  },
  {
    username: 'Triu',
    email: 'triu@growth.test',
    role: 'WATCHER',
    profile: { bio: 'First-time Watcher, lifelong player. Building my first world and loving the chaos.' },
    watcherProfile: { philosophy: 'Learn by doing. Fail forward.', playstyle: 'Experimental. Homebrew everything.' },
  },
];

const TRAILBLAZERS: TestUser[] = [
  {
    username: 'Kael',
    email: 'kael@growth.test',
    role: 'TRAILBLAZER',
    profile: { bio: 'Veteran roleplayer. I live for the moments when the dice surprise everyone at the table.' },
  },
  {
    username: 'Mira',
    email: 'mira@growth.test',
    role: 'TRAILBLAZER',
    profile: { bio: 'Artist and storyteller. I draw my characters mid-session.' },
  },
  {
    username: 'Dusk',
    email: 'dusk@growth.test',
    role: 'TRAILBLAZER',
    profile: { bio: 'Quiet player, loud characters. I like the ones who burn bright and crash hard.' },
  },
  {
    username: 'Sol',
    email: 'sol@growth.test',
    role: 'TRAILBLAZER',
    profile: { bio: 'New to TTRPGs. A friend told me GRO.WTH was different. Let\'s find out.' },
  },
  {
    username: 'Nyx',
    email: 'nyx@growth.test',
    role: 'TRAILBLAZER',
    profile: { bio: 'I optimize. I min-max. Then I roleplay the consequences. Fight me.' },
  },
  {
    username: 'Ember',
    email: 'ember@growth.test',
    role: 'TRAILBLAZER',
    profile: { bio: 'Theatre kid turned TTRPG addict. Voice acting is mandatory at my table.' },
  },
  {
    username: 'Rook',
    email: 'rook@growth.test',
    role: 'TRAILBLAZER',
    profile: { bio: 'Programmer who treats character sheets like state machines. Sorry not sorry.' },
  },
  {
    username: 'Vesper',
    email: 'vesper@growth.test',
    role: 'TRAILBLAZER',
    profile: { bio: 'I write 10-page backstories and then my character dies session 2. It\'s a lifestyle.' },
  },
];

interface TestCampaign {
  name: string;
  genre: string;
  description: string;
  themes: string[];
  gmUsername: string;
  listingStatus: 'LISTED' | 'UNLISTED';
  listingDescription?: string;
  listingTags?: string[];
  maxTrailblazers: number;
  applicationTemplate: { id: string; prompt: string; required: boolean; category: string }[];
}

const CAMPAIGNS: TestCampaign[] = [
  {
    name: 'The Fraying',
    genre: 'Cosmic Horror',
    description: 'Reality is coming undone at the edges. The players are the last ones who can see the seams.',
    themes: ['entropy', 'perception', 'sacrifice'],
    gmUsername: 'Selva',
    listingStatus: 'LISTED',
    listingDescription: 'A slow-burn descent into a world where the laws of nature are negotiable. If you like Annihilation, Solaris, or staring into the void until it blinks — this is your table.',
    listingTags: ['horror', 'philosophical', 'long-campaign', 'mature'],
    maxTrailblazers: 4,
    applicationTemplate: [
      { id: 'origin', prompt: 'Where did your character grow up, and what did they believe was true about the world?', required: true, category: 'backstory' },
      { id: 'fracture', prompt: 'Describe a moment when your character\'s understanding of reality cracked.', required: true, category: 'backstory' },
      { id: 'fear', prompt: 'What does your character fear more than death?', required: true, category: 'personality' },
      { id: 'playstyle', prompt: 'What kind of scenes do you enjoy most as a player?', required: false, category: 'meta' },
    ],
  },
  {
    name: 'Ashwalkers',
    genre: 'Post-Apocalyptic',
    description: 'The world burned. What grew back is stranger. Nomadic survivors navigate a landscape that remembers.',
    themes: ['rebirth', 'memory', 'community'],
    gmUsername: 'Selva',
    listingStatus: 'LISTED',
    listingDescription: 'Post-apocalyptic survival with a mythic twist. The wasteland isn\'t dead — it\'s dreaming. Looking for players who care about building something, not just surviving.',
    listingTags: ['survival', 'exploration', 'community-building'],
    maxTrailblazers: 5,
    applicationTemplate: [
      { id: 'before', prompt: 'What does your character remember from before the Burning?', required: true, category: 'backstory' },
      { id: 'carries', prompt: 'What one object does your character carry that they\'d die to protect?', required: true, category: 'backstory' },
      { id: 'role', prompt: 'What role do you fill in your caravan? (Healer, scout, builder, etc.)', required: true, category: 'mechanics' },
    ],
  },
  {
    name: 'The Vigil of St. Ennoia',
    genre: 'Byzantine Fantasy',
    description: 'In a theocratic city-state modeled on Constantinople, saints walk among mortals and heresies reshape reality.',
    themes: ['faith', 'politics', 'transformation'],
    gmUsername: 'Trayman',
    listingStatus: 'LISTED',
    listingDescription: 'Intrigue and theology in a world where prayer has mechanical weight. Expect long conversations, moral dilemmas, and the occasional miracle. This is not a dungeon crawl.',
    listingTags: ['intrigue', 'theological', 'roleplay-heavy', 'long-campaign'],
    maxTrailblazers: 4,
    applicationTemplate: [
      { id: 'faith', prompt: 'What does your character believe about the divine? Are they devout, skeptical, or something else?', required: true, category: 'backstory' },
      { id: 'station', prompt: 'What is your character\'s social position in the city?', required: true, category: 'backstory' },
      { id: 'secret', prompt: 'What secret would destroy your character if it came to light?', required: true, category: 'personality' },
      { id: 'commitment', prompt: 'This campaign runs weekly for 6+ months. Can you commit to that schedule?', required: true, category: 'meta' },
    ],
  },
  {
    name: 'Rootwork',
    genre: 'Southern Gothic',
    description: 'A small town in the deep south where the old ways never quite died. Something is stirring beneath the red clay.',
    themes: ['heritage', 'secrets', 'land'],
    gmUsername: 'Trayman',
    listingStatus: 'LISTED',
    listingDescription: 'Southern gothic horror meets folklore. Think True Detective meets Beloved. Content warnings apply — this campaign deals with heavy themes respectfully.',
    listingTags: ['horror', 'folklore', 'investigation', 'mature'],
    maxTrailblazers: 3,
    applicationTemplate: [
      { id: 'connection', prompt: 'What ties your character to Millhaven, GA? Born there, moved there, or passing through?', required: true, category: 'backstory' },
      { id: 'gift', prompt: 'Everyone in Millhaven has a "gift" — a small supernatural ability they don\'t talk about. What\'s yours?', required: true, category: 'mechanics' },
      { id: 'tone', prompt: 'Are you comfortable with mature themes (not gratuitous, but heavy)? Any hard limits?', required: true, category: 'meta' },
    ],
  },
  {
    name: 'SIGNAL//NOISE',
    genre: 'Cyberpunk',
    description: 'A neon-drenched city where consciousness is currency and reality is ad-supported.',
    themes: ['identity', 'capitalism', 'connection'],
    gmUsername: 'Triu',
    listingStatus: 'LISTED',
    listingDescription: 'Cyberpunk with soul. Less chrome, more existential dread. First campaign I\'m running — looking for patient players who want to build something weird with me.',
    listingTags: ['cyberpunk', 'experimental', 'new-gm', 'collaborative'],
    maxTrailblazers: 4,
    applicationTemplate: [
      { id: 'handle', prompt: 'What\'s your character\'s handle (street name) and how did they earn it?', required: true, category: 'backstory' },
      { id: 'debt', prompt: 'Who does your character owe, and what happens if they don\'t pay?', required: true, category: 'backstory' },
      { id: 'patience', prompt: 'I\'m a new GM. What\'s one thing you wish GMs did more of?', required: false, category: 'meta' },
    ],
  },
  {
    name: 'Tide Runners',
    genre: 'Maritime Adventure',
    description: 'Sail the Shattered Sea — an archipelago of impossible islands where the tides carry more than water.',
    themes: ['freedom', 'discovery', 'crew'],
    gmUsername: 'Triu',
    listingStatus: 'UNLISTED',
    listingDescription: undefined,
    listingTags: undefined,
    maxTrailblazers: 5,
    applicationTemplate: [
      { id: 'role', prompt: 'What\'s your role on the ship?', required: true, category: 'mechanics' },
      { id: 'sea', prompt: 'Why did your character take to the sea?', required: true, category: 'backstory' },
    ],
  },
];

// Which trailblazers are in which campaigns, with application status
interface Membership {
  trailblazer: string;
  campaign: string;
  applicationStatus: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REVISION' | 'DENIED';
  responses: { promptId: string; prompt: string; response: string }[];
}

const MEMBERSHIPS: Membership[] = [
  // The Fraying — Selva's campaign (4 slots)
  { trailblazer: 'Kael', campaign: 'The Fraying', applicationStatus: 'APPROVED', responses: [
    { promptId: 'origin', prompt: 'Where did your character grow up?', response: 'A lighthouse on a coast that doesn\'t appear on modern maps. My father kept the light burning for ships that stopped coming decades ago.' },
    { promptId: 'fracture', prompt: 'When did reality crack?', response: 'I saw my reflection blink when I didn\'t. I was fourteen. I haven\'t trusted mirrors since.' },
    { promptId: 'fear', prompt: 'What do you fear more than death?', response: 'That nothing is observing us. That the void is exactly as empty as it looks.' },
  ]},
  { trailblazer: 'Mira', campaign: 'The Fraying', applicationStatus: 'APPROVED', responses: [
    { promptId: 'origin', prompt: 'Where did your character grow up?', response: 'In a commune of artists in the mountains. We painted what we dreamed, and sometimes the paintings moved.' },
    { promptId: 'fracture', prompt: 'When did reality crack?', response: 'I finished a painting I don\'t remember starting. It was a portrait of a woman I\'d never met. She showed up at my door the next day.' },
    { promptId: 'fear', prompt: 'What do you fear more than death?', response: 'Being seen completely. Every layer, every lie, every hidden ugly thing. Transparent.' },
  ]},
  { trailblazer: 'Dusk', campaign: 'The Fraying', applicationStatus: 'SUBMITTED', responses: [
    { promptId: 'origin', prompt: 'Where did your character grow up?', response: 'Orphanage. State system. Moved eight times before I was twelve. Nowhere is home.' },
    { promptId: 'fracture', prompt: 'When did reality crack?', response: 'I died for four minutes on an operating table. What I saw wasn\'t nothing. It was everything, all at once, and it was looking at me.' },
    { promptId: 'fear', prompt: 'What do you fear more than death?', response: 'Going back. To that place I saw for four minutes. Knowing it\'s waiting.' },
  ]},

  // Ashwalkers — Selva's campaign (5 slots)
  { trailblazer: 'Ember', campaign: 'Ashwalkers', applicationStatus: 'APPROVED', responses: [
    { promptId: 'before', prompt: 'What do you remember from before?', response: 'Music. My mother sang hymns while she cooked. I can still hear the melody but the words are gone.' },
    { promptId: 'carries', prompt: 'What object do you protect?', response: 'A cracked harmonica. It only plays three notes now but they\'re the right three.' },
    { promptId: 'role', prompt: 'Your caravan role?', response: 'Singer. Morale officer. The one who reminds people why we keep walking.' },
  ]},
  { trailblazer: 'Sol', campaign: 'Ashwalkers', applicationStatus: 'SUBMITTED', responses: [
    { promptId: 'before', prompt: 'What do you remember from before?', response: 'Honestly? Not much. I was young. I remember the smell of rain on hot pavement. That\'s it.' },
    { promptId: 'carries', prompt: 'What object do you protect?', response: 'A children\'s book with half the pages missing. I can\'t read it but the pictures tell a story.' },
    { promptId: 'role', prompt: 'Your caravan role?', response: 'I forage. I find things. I have a knack for knowing where water is.' },
  ]},
  { trailblazer: 'Rook', campaign: 'Ashwalkers', applicationStatus: 'DRAFT', responses: [
    { promptId: 'before', prompt: 'What do you remember from before?', response: 'Server rooms humming. I was a sysadmin. I kept things running. Now nothing runs.' },
  ]},

  // The Vigil of St. Ennoia — Trayman's campaign
  { trailblazer: 'Vesper', campaign: 'The Vigil of St. Ennoia', applicationStatus: 'APPROVED', responses: [
    { promptId: 'faith', prompt: 'What does your character believe?', response: 'That the saints are real but the church is a cage built around them. I serve the divine, not the institution.' },
    { promptId: 'station', prompt: 'Social position?', response: 'Scribe in the Imperial Archive. Low rank, high access. I know where the redacted texts are kept.' },
    { promptId: 'secret', prompt: 'What secret would destroy you?', response: 'I\'ve been copying forbidden gospels and distributing them through the market district. They call it heresy. I call it liberation.' },
    { promptId: 'commitment', prompt: 'Can you commit?', response: 'Absolutely. This is the campaign I\'ve been waiting for.' },
  ]},
  { trailblazer: 'Nyx', campaign: 'The Vigil of St. Ennoia', applicationStatus: 'APPROVED', responses: [
    { promptId: 'faith', prompt: 'What does your character believe?', response: 'The divine is a system. Prayer is an input. Miracles are outputs. I want to understand the algorithm.' },
    { promptId: 'station', prompt: 'Social position?', response: 'Foreign merchant with diplomatic immunity. I trade in relics — some genuine, some... manufactured.' },
    { promptId: 'secret', prompt: 'What secret would destroy you?', response: 'I\'m not from another city. I\'m from another century. I don\'t age. I don\'t know why.' },
    { promptId: 'commitment', prompt: 'Can you commit?', response: 'I\'ve been in a 2-year campaign before. I don\'t quit.' },
  ]},
  { trailblazer: 'Kael', campaign: 'The Vigil of St. Ennoia', applicationStatus: 'SUBMITTED', responses: [
    { promptId: 'faith', prompt: 'What does your character believe?', response: 'Faith is a muscle. You exercise it or it atrophies. I exercise mine through service to the poor.' },
    { promptId: 'station', prompt: 'Social position?', response: 'Deacon of a minor parish in the outer walls. The forgotten district. My congregation is beggars and refugees.' },
    { promptId: 'secret', prompt: 'What secret would destroy you?', response: 'I killed a man before I took orders. He deserved it. The church doesn\'t care about deserving.' },
    { promptId: 'commitment', prompt: 'Can you commit?', response: 'Yes. I play in one other game on alternating weeks.' },
  ]},

  // Rootwork — Trayman's campaign (3 slots)
  { trailblazer: 'Mira', campaign: 'Rootwork', applicationStatus: 'REVISION', responses: [
    { promptId: 'connection', prompt: 'What ties you to Millhaven?', response: 'My grandmother lived here. She left me the house when she died. I came to sell it.' },
    { promptId: 'gift', prompt: 'What\'s your gift?', response: 'I can hear what the plants are feeling. Not words — emotions. The kudzu is always angry.' },
    { promptId: 'tone', prompt: 'Comfortable with mature themes?', response: 'Yes, as long as there\'s no gratuitous sexual violence.' },
  ]},
  { trailblazer: 'Dusk', campaign: 'Rootwork', applicationStatus: 'SUBMITTED', responses: [
    { promptId: 'connection', prompt: 'What ties you to Millhaven?', response: 'I\'m a journalist investigating disappearances in rural Georgia. Millhaven has had eleven in six years.' },
    { promptId: 'gift', prompt: 'What\'s your gift?', response: 'I know when someone is lying. It tastes like copper on my tongue.' },
    { promptId: 'tone', prompt: 'Comfortable with mature themes?', response: 'Yes. Bring it. I play horror for the horror.' },
  ]},

  // SIGNAL//NOISE — Triu's campaign
  { trailblazer: 'Nyx', campaign: 'SIGNAL//NOISE', applicationStatus: 'APPROVED', responses: [
    { promptId: 'handle', prompt: 'Handle and how earned?', response: '"Null" — because I can zero out any security system in under sixty seconds. Also because I feel like nothing most of the time.' },
    { promptId: 'debt', prompt: 'Who do you owe?', response: 'MedCorps. They replaced my spine after the accident. The payments are automatic. If I miss three, the spine locks up.' },
  ]},
  { trailblazer: 'Rook', campaign: 'SIGNAL//NOISE', applicationStatus: 'SUBMITTED', responses: [
    { promptId: 'handle', prompt: 'Handle and how earned?', response: '"Checksum" — I verify things. Data, people, alibis. If it doesn\'t add up, I find the error.' },
    { promptId: 'debt', prompt: 'Who do you owe?', response: 'My sister. She took a contract job in the undercity to pay for my education. She hasn\'t come back.' },
  ]},
  { trailblazer: 'Ember', campaign: 'SIGNAL//NOISE', applicationStatus: 'DRAFT', responses: [
    { promptId: 'handle', prompt: 'Handle and how earned?', response: '"Reverb" — street performer. My voice carries further than physics allows.' },
  ]},
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  console.log('=== Seeding Test Data ===\n');

  // Create users
  const userMap = new Map<string, string>(); // username -> id

  for (const u of [...WATCHERS, ...TRAILBLAZERS]) {
    const existing = await prisma.user.findUnique({ where: { username: u.username } });
    if (existing) {
      console.log(`  [skip] ${u.username} already exists`);
      userMap.set(u.username, existing.id);
      continue;
    }

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          username: u.username,
          email: u.email,
          passwordHash,
          role: u.role,
          profile: u.profile ? JSON.stringify(u.profile) : null,
          watcherProfile: u.watcherProfile ? JSON.stringify(u.watcherProfile) : null,
        },
      });

      await tx.wallet.create({
        data: { ownerId: newUser.id, walletType: 'USER', ownerType: 'USER', balance: u.role === 'WATCHER' ? 100000 : 0 },
      });

      return newUser;
    });

    console.log(`  [created] ${user.username} (${user.role})`);
    userMap.set(user.username, user.id);
  }

  // Create campaigns
  const campaignMap = new Map<string, string>(); // name -> id

  for (const c of CAMPAIGNS) {
    const gmId = userMap.get(c.gmUsername);
    if (!gmId) { console.log(`  [error] GM ${c.gmUsername} not found`); continue; }

    const existing = await prisma.campaign.findFirst({ where: { name: c.name, gmUserId: gmId } });
    if (existing) {
      console.log(`  [skip] Campaign "${c.name}" already exists`);
      campaignMap.set(c.name, existing.id);
      continue;
    }

    const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    const campaign = await prisma.$transaction(async (tx) => {
      const newCampaign = await tx.campaign.create({
        data: {
          name: c.name,
          genre: c.genre,
          description: c.description,
          themes: JSON.stringify(c.themes),
          gmUserId: gmId,
          inviteCode,
          listingStatus: c.listingStatus,
          listingDescription: c.listingDescription || null,
          listingTags: c.listingTags ? JSON.stringify(c.listingTags) : null,
          maxTrailblazers: c.maxTrailblazers,
          applicationTemplate: JSON.stringify(c.applicationTemplate),
        },
      });

      // Create campaign wallet
      await tx.wallet.create({
        data: {
          walletType: 'CAMPAIGN',
          ownerType: 'CAMPAIGN',
          campaignId: newCampaign.id,
          balance: 50000,
        },
      });

      return newCampaign;
    });

    console.log(`  [created] Campaign "${campaign.name}" (${c.listingStatus}) by ${c.gmUsername} — invite: ${inviteCode}`);
    campaignMap.set(c.name, campaign.id);
  }

  // Create memberships + applications
  for (const m of MEMBERSHIPS) {
    const userId = userMap.get(m.trailblazer);
    const campaignId = campaignMap.get(m.campaign);
    if (!userId || !campaignId) {
      console.log(`  [error] Could not find user ${m.trailblazer} or campaign ${m.campaign}`);
      continue;
    }

    const existingMember = await prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId, userId } },
    });
    if (existingMember) {
      console.log(`  [skip] ${m.trailblazer} already in "${m.campaign}"`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const member = await tx.campaignMember.create({
        data: { campaignId, userId },
      });

      await tx.campaignApplication.create({
        data: {
          campaignId,
          memberId: member.id,
          responses: JSON.stringify(m.responses),
          status: m.applicationStatus,
        },
      });
    });

    console.log(`  [joined] ${m.trailblazer} → "${m.campaign}" (${m.applicationStatus})`);
  }

  console.log('\n=== Seed Complete ===');
  console.log(`\nAll test users have password: "${PASSWORD}"`);
  console.log('\nWatchers: Selva, Trayman, Triu');
  console.log('Trailblazers: Kael, Mira, Dusk, Sol, Nyx, Ember, Rook, Vesper');
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
