/**
 * Style-LoRA corpus — CONTENT prompts (pure data, no I/O).
 *
 * The corpus pipeline: plain content images (Qwen-Image-2.1, this list) → style transfer into the
 * GROWTH look on a pod (QwenStyle / Qwen-Image-Edit-2509 LoRA) → cull → LoRA training.
 *
 * Prompts here are PLAIN and descriptive: no art-medium words at all (the look is added later by the
 * style-transfer step). Mike (13 Oct): "not just portraits but just about any genre, pose, angle, etc."
 * Every setting carries its LIGHTING ("lit by …") — taste notes item 8: the setting's light decides
 * whether a frame reads dark fantasy or bright sci-fi.
 *
 * Orientation: figures portrait 832×1248, scenes / groups / creatures landscape 1248×832, items square.
 * Seeds are deterministic (FNV-1a of the id) so a rerun reproduces the same frame.
 */

export const CORPUS_GROUPS = ['people', 'beings', 'creatures', 'items', 'scenes', 'groups'] as const;
export type CorpusGroup = (typeof CORPUS_GROUPS)[number];

export interface CorpusPrompt {
  id: string;
  group: CorpusGroup;
  /** Genre / mood whose lighting the prompt carries (bookkeeping for culling). */
  genre: string;
  prompt: string;
  width: number;
  height: number;
  seed: number;
}

export const CORPUS_PORTRAIT = { width: 832, height: 1248 } as const;
export const CORPUS_LANDSCAPE = { width: 1248, height: 832 } as const;
export const CORPUS_SQUARE = { width: 1024, height: 1024 } as const;

/** The only words the content pass adds to a corpus prompt (provider generateContent). */
export const CORPUS_CONTENT_SUFFIX = 'Sharp, well-lit, clear subject.';

export function buildCorpusContentPrompt(prompt: string): string {
  const p = prompt.trim();
  return `${p}${/[.!?]$/.test(p) ? '' : '.'} ${CORPUS_CONTENT_SUFFIX}`;
}

/** Deterministic 31-bit seed from an id (FNV-1a). */
export function corpusSeed(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & 0x7fffffff;
}

// ------------------------------------------------------------------
// Genres: settings (with light), wardrobe, a swung prop, an item surface
// ------------------------------------------------------------------

interface Genre {
  key: string;
  settings: string[];
  outfits: string[];
  weapon: string;
  surface: string;
}

const GENRES: Genre[] = [
  {
    key: 'dark-fantasy',
    settings: [
      'in a stone great hall, lit by flickering torches against deep shadow',
      'in a misty pine forest at dusk, lit by a cold blue moon and a small campfire',
      'on a rain-soaked castle rampart, lit by a pale overcast sky and distant lightning',
    ],
    outfits: ['a wool cloak over a leather jerkin', 'a dented steel breastplate over a quilted gambeson'],
    weapon: 'a longsword',
    surface: 'a scarred oak table, lit by a single torch from the left with deep shadow behind',
  },
  {
    key: 'bright-sci-fi',
    settings: [
      'in a bright steel corridor, lit by cool white ceiling panels with a glowing teal seam along the wall',
      'on a clean observation deck, lit by bright daylight through tall windows overlooking white towers',
      'in a white medical bay, lit by soft even overhead light and pale blue holographic displays',
    ],
    outfits: ['a fitted white flight suit with teal piping', 'a grey utility jumpsuit with a padded collar'],
    weapon: 'a glowing energy baton',
    surface: 'a white glossy counter, lit by cool even panel light with a teal rim light',
  },
  {
    key: 'horror',
    settings: [
      'in an abandoned farmhouse kitchen, lit by a single bare bulb hanging overhead',
      'in a fog-filled graveyard at night, lit by a hand lantern from below',
      'in a narrow basement corridor, lit by a red emergency light',
    ],
    outfits: ['a stained cardigan over a nightshirt', 'a rain-soaked canvas coat'],
    weapon: 'a fire axe',
    surface: 'a dusty cellar shelf, lit by a flashlight beam from below',
  },
  {
    key: 'romance',
    settings: [
      'on a stone balcony at golden hour, lit by warm low sunlight and strings of small lights',
      'in a dining room, lit by tall candles and a fireplace glow',
      'in a flower garden in late afternoon, lit by soft warm backlight',
    ],
    outfits: ['a soft linen shirt and a long silk scarf', 'a velvet jacket over a white shirt'],
    weapon: 'a fencing foil',
    surface: 'a lace tablecloth beside a vase of roses, lit by warm candlelight',
  },
  {
    key: 'western',
    settings: [
      'on a dusty main street at high noon, lit by harsh overhead sun with short hard shadows',
      'inside a wooden saloon, lit by oil lamps and dusty window light',
      'on an open prairie at sunset, lit by a low orange sun',
    ],
    outfits: ['a long dusty duster coat and a wide-brimmed hat', 'a leather vest over a cotton shirt and a bandana'],
    weapon: 'a coiled lasso',
    surface: 'a weathered plank bar top, lit by an oil lamp and dusty window light',
  },
  {
    key: 'nautical',
    settings: [
      'on the deck of a wooden sailing ship, lit by bright sea sunlight and flying spray',
      "below deck in a ship's cabin, lit by a swaying brass lantern",
      'on a harbour pier in a storm, lit by grey storm light and a lighthouse beam',
    ],
    outfits: ['a heavy wool pea coat and a knit cap', "a striped sailor's shirt and canvas trousers"],
    weapon: 'a cutlass',
    surface: "a ship's chart table covered in maps, lit by a swaying brass lantern",
  },
  {
    key: 'gothic',
    settings: [
      'in a cathedral nave, lit by shafts of coloured light through stained glass',
      'in a library of tall dark shelves, lit by a silver candelabra',
      'in a manor bedroom at night, lit by cold moonlight through lace curtains',
    ],
    outfits: ['a high-collared black velvet coat', 'a long dark brocade robe'],
    weapon: 'a silver-headed cane',
    surface: 'a black marble mantelpiece, lit by cold moonlight and one candle',
  },
  {
    key: 'mystery',
    settings: [
      "in a cluttered office at night, lit by a green desk lamp and neon signs through rain-streaked windows",
      'on a foggy cobblestone street, lit by gas streetlamps',
      'in a dim train compartment, lit by passing station lights',
    ],
    outfits: ['a belted trench coat and a fedora', 'a tweed suit with a waistcoat'],
    weapon: 'a heavy walking stick',
    surface: 'a cluttered desk of case files, lit by a green desk lamp in a dark room',
  },
];

const genreAt = (k: number) => GENRES[k % GENRES.length];
const settingAt = (k: number) => {
  const g = genreAt(k);
  return g.settings[Math.floor(k / GENRES.length) % g.settings.length];
};
const outfitAt = (k: number) => {
  const g = genreAt(k);
  return g.outfits[Math.floor(k / GENRES.length) % g.outfits.length];
};

// ------------------------------------------------------------------
// Shots for people / beings
// ------------------------------------------------------------------

type ShotFn = (subject: string, outfit: string, g: Genre) => string;

const SHOTS: Array<{ key: string; fn: ShotFn }> = [
  { key: 'head', fn: (s, o) => `Head-and-shoulders view of ${s}${o}, looking at the camera` },
  { key: 'half', fn: (s, o) => `Half-length view of ${s}${o}, arms relaxed at the sides` },
  { key: 'full', fn: (s, o) => `Full-length view of ${s} standing${o}, the whole body in frame from head to feet` },
  { key: 'back', fn: (s, o) => `Back view of ${s}${o}, seen from behind walking away from the camera` },
  { key: 'profile', fn: (s, o) => `Side profile view of ${s}${o}, gazing into the distance` },
  { key: 'three-quarter', fn: (s, o) => `Three-quarter view of ${s}${o}, turned slightly away from the camera` },
  { key: 'low', fn: (s, o) => `Low-angle view looking up at ${s}${o}, standing tall and looming over the camera` },
  { key: 'high', fn: (s, o) => `High-angle view looking down at ${s}${o}, glancing up toward the camera` },
  { key: 'run', fn: (s, o) => `Full-length action shot of ${s}, running toward the camera${o}, hair and clothing caught in motion` },
  { key: 'swing', fn: (s, o, g) => `Action shot of ${s}, swinging ${g.weapon} in a wide arc${o}, weight thrown forward` },
  { key: 'cast', fn: (s, o) => `Action shot of ${s}, casting a spell${o}, both hands raised with a bright glow of light between the palms` },
  { key: 'seated', fn: (s, o) => `${cap(s)} seated on a wooden chair${o}, leaning forward with elbows on the knees` },
  // Mike (13 Oct): top-down in a tall frame never reads as lying down, and a ground-level side view is a weird angle;
  // shoot it the way a person would: standing over them, looking down at an angle, landscape frame.
  { key: 'lying', fn: (s, o) => `${cap(s)} lying flat on their back on the ground${o}, asleep with eyes closed and arms resting at the sides, photographed from standing height looking down at them at an angle, the body stretched out diagonally across the frame with the feet nearer the camera` },
];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ------------------------------------------------------------------
// Subjects
// ------------------------------------------------------------------

const PEOPLE: string[] = [
  'a girl of about eight with curly red hair and freckled pale skin',
  'a boy of about ten with straight black hair and warm brown skin',
  'a teenage girl with long box braids and dark brown skin',
  'a lanky teenage boy with sandy hair and fair skin',
  'a slender young woman in her twenties with short platinum hair and pale skin',
  'a muscular young man in his twenties with a shaved head and deep brown skin',
  'a heavyset woman in her thirties with a dark bob and olive skin',
  'a tall broad-shouldered man in his thirties with a red beard and ruddy fair skin',
  'a petite East Asian woman in her thirties with a long black ponytail',
  'a stocky South Asian man in his forties with a neat grey-streaked beard',
  'a Black woman in her forties with natural coily hair and an athletic build',
  'a slim Latino man in his forties with slicked-back hair and a thin moustache',
  'a plump middle-aged woman with rosy cheeks and greying blonde hair',
  'a gaunt middle-aged man with hollow cheeks and dark stubble',
  'a tall Indigenous woman in her fifties with a long silver-streaked braid',
  'a bald heavyset man in his fifties with light brown skin',
  'an elderly woman in her seventies with a white bun and deeply lined pale skin',
  'an elderly man in his eighties with a long white beard and dark brown skin',
  'a frail elderly East Asian man with thin white hair and a wooden cane',
  'a stout elderly woman with brown skin and a grey headscarf',
  'a pregnant woman in her late twenties with wavy auburn hair',
  'a wiry man in his sixties with a weathered tan face and a grey ponytail',
  'a very tall thin woman with a buzz cut and medium brown skin',
  'a muscular woman in her thirties with a scarred jaw and tanned skin',
];

/** GROWTH-flavoured beings. clothed=false → no wardrobe line (the body is the subject). */
const BEINGS: Array<{ key: string; text: string; clothed: boolean }> = [
  { key: 'etherling', text: "an Et'herling, a tall slender elf-like person with long pointed ears, luminous pale grey eyes and silver-white hair", clothed: true },
  { key: 'cambion', text: 'a cambion, a half-demon man with ash-grey skin, small swept-back horns and amber eyes', clothed: true },
  { key: 'horned', text: 'a horned woman with long curling ram horns, dark skin and gold rings in her ears', clothed: true },
  { key: 'undead', text: 'an undead knight with grey skin drawn tight over the bones, sunken cheeks and pale glowing eyes', clothed: true },
  { key: 'reptilian', text: 'a reptilian humanoid with green-bronze scales, a crested head and slit-pupil eyes', clothed: true },
  { key: 'insectoid', text: 'an insectoid humanoid with a glossy blue-black carapace, compound eyes and four arms', clothed: false },
  { key: 'construct', text: 'a humanoid construct of riveted brass plates and exposed gears with a glass face plate', clothed: false },
  { key: 'spirit', text: 'the translucent spirit of a young woman, her lower body fading into pale mist', clothed: false },
];

const CREATURES: Array<{ key: string; text: string; action: string }> = [
  { key: 'wolf', text: 'a large grey wolf', action: 'leaping over a fallen log, jaws open' },
  { key: 'horse', text: 'a black draft horse with feathered hooves', action: 'rearing up on its hind legs' },
  { key: 'raven', text: 'a large raven', action: 'taking flight with wings fully spread' },
  { key: 'wyvern', text: 'a wyvern with leathery wings and a barbed tail', action: 'diving with claws outstretched' },
  { key: 'lynx', text: 'a lynx with tufted ears', action: 'crouched low and stalking forward' },
  { key: 'boar', text: 'a huge boar with curved tusks', action: 'charging through mud' },
];

const ITEMS: Array<{ key: string; text: string; inHand: string }> = [
  { key: 'longsword', text: 'a steel longsword with a leather-wrapped grip', inHand: 'gripped in a gauntleted hand' },
  { key: 'flintlock', text: 'a flintlock pistol with a walnut stock and brass fittings', inHand: 'held level in an outstretched hand' },
  { key: 'phone', text: 'a smartphone with a cracked screen showing a map', inHand: 'held in a hand, thumb on the screen' },
  { key: 'laptop', text: 'an open laptop covered in stickers', inHand: 'balanced on a lap, both hands on the keyboard' },
  { key: 'hammer', text: "a blacksmith's hammer with a worn hickory handle", inHand: 'raised in a soot-streaked hand' },
  { key: 'reliquary', text: 'a silver reliquary with a crystal window holding a small bone', inHand: 'cradled in two open palms' },
  { key: 'journal', text: 'a leather-bound journal with brass clasps', inHand: 'held open in one hand, the other turning a page' },
  { key: 'amulet', text: 'a glowing crystal amulet on a silver chain', inHand: 'dangling from the fingers of a raised hand' },
  { key: 'compass', text: 'a brass pocket compass with an engraved lid', inHand: 'lying open in a palm' },
  { key: 'lantern', text: 'a kerosene lantern with a glass chimney', inHand: 'held up at arm’s length by the handle' },
];

/** Each scene: [genre key, wide establishing, detail] — light written into both. */
const SCENES: Array<{ key: string; genre: string; wide: string; detail: string }> = [
  {
    key: 'throne-room', genre: 'gothic',
    wide: 'Wide establishing view of a vast empty throne room with black stone columns and a red carpet leading to a high throne, lit by shafts of coloured light through tall stained-glass windows',
    detail: 'Close detail of the carved armrest of a stone throne worn smooth by hands, lit by a shaft of red and gold light through stained glass',
  },
  {
    key: 'mountain-valley', genre: 'dark-fantasy',
    wide: 'Wide establishing view of a deep mountain valley with a winding river and a lone watchtower, lit by low storm light breaking through dark clouds',
    detail: 'Close detail of lichen-covered rocks beside a fast mountain stream, lit by a break of cold sunlight under storm clouds',
  },
  {
    key: 'city-street', genre: 'bright-sci-fi',
    wide: 'Wide establishing view of a busy city street of white towers, elevated trams and crowds of pedestrians, lit by bright midday sun and glowing teal shop signs',
    detail: 'Close detail of a tram stop sign and a puddle reflecting towers, lit by bright midday sun and teal neon',
  },
  {
    key: 'ship-deck', genre: 'nautical',
    wide: 'Wide establishing view of the deck of a three-masted sailing ship at sea with rigging and full sails, lit by bright sea sunlight and spray',
    detail: 'Close detail of a coiled rope beside a brass ship’s bell on wet deck planks, lit by bright sea sunlight',
  },
  {
    key: 'lab', genre: 'bright-sci-fi',
    wide: 'Wide establishing view of a clean research laboratory with glass sample tanks, robotic arms and long white benches, lit by cool white ceiling panels',
    detail: 'Close detail of a rack of glowing sample vials and a gloved hand adjusting a dial, lit by cool white panel light',
  },
  {
    key: 'forge', genre: 'dark-fantasy',
    wide: 'Wide establishing view of a stone forge with an anvil, racks of tongs and a roaring furnace, lit by orange furnace glow against deep shadow',
    detail: 'Close detail of a glowing orange blade resting on an anvil with sparks in the air, lit by furnace glow',
  },
  {
    key: 'forest', genre: 'romance',
    wide: 'Wide establishing view of an old beech forest with a mossy path and ferns, lit by warm late-afternoon sunbeams through the canopy',
    detail: 'Close detail of moss and small white flowers on a fallen trunk, lit by a warm sunbeam',
  },
  {
    key: 'ruins', genre: 'mystery',
    wide: 'Wide establishing view of overgrown temple ruins with broken columns and a collapsed dome, lit by pale morning fog light',
    detail: 'Close detail of a cracked stone relief half covered in ivy, lit by pale diffuse fog light',
  },
  {
    key: 'bar', genre: 'western',
    wide: 'Wide establishing view of a crowded frontier bar with a long wooden counter, a piano and swinging doors, lit by oil lamps and dusty window light',
    detail: 'Close detail of a shot glass and a deck of worn playing cards on a plank counter, lit by an oil lamp',
  },
  {
    key: 'void', genre: 'horror',
    wide: 'Wide establishing view of an endless black void with floating fragments of a broken house drifting in the dark, lit by a single cold white light from far above',
    detail: 'Close detail of a floating broken door frame with splinters drifting around it in the black void, lit by a single cold white light from above',
  },
];

const GROUPS: Array<{ key: string; genre: string; text: string }> = [
  { key: 'campfire', genre: 'dark-fantasy', text: 'Two travellers in hooded cloaks sharing a meal beside a campfire at the edge of a dark forest, lit by the orange firelight against a night sky' },
  { key: 'bridge-crew', genre: 'bright-sci-fi', text: 'Three crew members in white uniforms working at consoles on a starship bridge, one pointing at a large window full of stars, lit by bright cool panel light and teal console glow' },
  { key: 'dance', genre: 'romance', text: 'A couple dancing close in an empty ballroom, his hand on her back, her dress sweeping out, lit by warm chandelier light' },
  { key: 'standoff', genre: 'western', text: 'Four gunslingers facing off across a dusty street, coats blowing in the wind, lit by harsh late-afternoon sun with long shadows' },
  { key: 'cellar', genre: 'horror', text: 'Three frightened people with flashlights creeping down cellar stairs together, lit only by their flashlight beams in the darkness' },
  { key: 'rope-haul', genre: 'nautical', text: 'Two sailors hauling on a thick rope on a pitching ship deck in a storm, lit by grey storm light and a flash of lightning' },
];

// ------------------------------------------------------------------
// Build
// ------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

function entry(id: string, group: CorpusGroup, genre: string, prompt: string, size: { width: number; height: number }): CorpusPrompt {
  return { id, group, genre, prompt: prompt.endsWith('.') ? prompt : `${prompt}.`, width: size.width, height: size.height, seed: corpusSeed(id) };
}

/** The full content list (~130 prompts), in a stable order. */
export function buildCorpusPrompts(): CorpusPrompt[] {
  const out: CorpusPrompt[] = [];

  // people: 2 shots each, shots and genres cycle independently
  let k = 0;
  PEOPLE.forEach((person, i) => {
    for (let j = 0; j < 2; j++, k++) {
      const shot = SHOTS[(i * 2 + j) % SHOTS.length];
      const g = genreAt(k);
      const text = `${shot.fn(person, `, wearing ${outfitAt(k)}`, g)}, ${settingAt(k)}`;
      out.push(entry(`people-${pad(i + 1)}-${shot.key}`, 'people', g.key, text, shot.key === 'lying' ? CORPUS_LANDSCAPE : CORPUS_PORTRAIT));
    }
  });

  // beings: 3 shots each, offset so they start on a different shot than people
  k = 3;
  BEINGS.forEach((b, i) => {
    for (let j = 0; j < 3; j++, k++) {
      const shot = SHOTS[(i * 3 + j + 5) % SHOTS.length];
      const g = genreAt(k);
      const o = b.clothed ? `, wearing ${outfitAt(k)}` : '';
      out.push(entry(`beings-${pad(i + 1)}-${b.key}-${shot.key}`, 'beings', g.key, `${shot.fn(b.text, o, g)}, ${settingAt(k)}`, shot.key === 'lying' ? CORPUS_LANDSCAPE : CORPUS_PORTRAIT));
    }
  });

  // creatures: full side view + action, landscape
  k = 1;
  CREATURES.forEach((c, i) => {
    const g1 = genreAt(k);
    out.push(entry(`creatures-${pad(i + 1)}-${c.key}-side`, 'creatures', g1.key, `Full-body side view of ${c.text} standing still, ${settingAt(k)}`, CORPUS_LANDSCAPE));
    k++;
    const g2 = genreAt(k);
    out.push(entry(`creatures-${pad(i + 1)}-${c.key}-action`, 'creatures', g2.key, `Action shot of ${c.text} ${c.action}, ${settingAt(k)}`, CORPUS_LANDSCAPE));
    k++;
  });

  // items: product shot + in-hand, square
  k = 0;
  ITEMS.forEach((it, i) => {
    const g1 = genreAt(k);
    out.push(entry(`items-${pad(i + 1)}-${it.key}-product`, 'items', g1.key, `Product shot of ${it.text}, centred on ${g1.surface}`, CORPUS_SQUARE));
    k++;
    const g2 = genreAt(k);
    out.push(entry(`items-${pad(i + 1)}-${it.key}-in-hand`, 'items', g2.key, `Close view of ${it.text} ${it.inHand}, ${settingAt(k)}`, CORPUS_SQUARE));
    k++;
  });

  // scenes: wide + detail, landscape
  SCENES.forEach((s, i) => {
    out.push(entry(`scenes-${pad(i + 1)}-${s.key}-wide`, 'scenes', s.genre, s.wide, CORPUS_LANDSCAPE));
    out.push(entry(`scenes-${pad(i + 1)}-${s.key}-detail`, 'scenes', s.genre, s.detail, CORPUS_LANDSCAPE));
  });

  // groups: one wide frame each, landscape
  GROUPS.forEach((gr, i) => {
    out.push(entry(`groups-${pad(i + 1)}-${gr.key}`, 'groups', gr.genre, gr.text, CORPUS_LANDSCAPE));
  });

  return out;
}
