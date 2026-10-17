/**
 * WHAT THE CAMERA SEES (Mike 2026-10-16: "we need a system that can determine
 * what will be showing based on camera angle and layers / how they lay, then
 * makes a prompt accordingly").
 *
 * The first dressed portraits named things the camera could not see — boots in
 * a waist-up frame, a navel piercing and a forearm tattoo under a cardigan and
 * tee — and the painter obeyed: the marks showed THROUGH the cloth and the
 * frame slid down to the feet. This module decides, before any words are
 * written, what is visible:
 *
 *   camera  = frame (bust = waist up | figure = head to feet) + facing (front | back)
 *   layers  = every equipped piece → the body zones it covers, how it lies
 *             (open-front garments show what is under them down the middle;
 *             sleeve length; necklines that half-cover the collarbone)
 *   result  = per piece: seen / not seen (and "hanging open over" what);
 *             per mark: shown / half-hidden by an edge / hidden
 *
 * Pure, no model. Words only on the way out (the prompt names only what shows).
 */

export type Zone =
  | 'scalp' | 'face' | 'neck' | 'collar' | 'chest' | 'belly' | 'back'
  | 'upperArms' | 'forearms' | 'hands' | 'waist' | 'hips' | 'thighs' | 'lowerLegs' | 'feet';

export type Side = 'left' | 'right';

export interface Camera {
  frame: 'bust' | 'figure';
  facing: 'front' | 'back';
  /** A half-turn: the side of the body nearer the camera. The far arm (and its ear) is behind the body. */
  near?: Side | null;
}

/** How the pose changes the way the clothes lie (null = as they are worn). */
export interface PoseEffects {
  sleevesUp: boolean;
  /** true = open-front garments hang open; false = pulled or fastened closed. */
  open: boolean | null;
}

export const NO_POSE_EFFECTS: PoseEffects = { sleevesUp: false, open: null };

export const PORTRAIT_CAMERA: Camera = { frame: 'bust', facing: 'front' };

/** Zones inside the frame. The bust's bottom edge is the waist: the top of the trousers shows, the legs do not. */
const FRAME_ZONES: Record<Camera['frame'], ReadonlySet<Zone>> = {
  // The bust stops at the lower ribs (Mike: 'framing is still a little low') — the trousers are out of frame.
  bust: new Set<Zone>(['scalp', 'face', 'neck', 'collar', 'chest', 'belly', 'back', 'upperArms', 'forearms', 'hands']),
  figure: new Set<Zone>(['scalp', 'face', 'neck', 'collar', 'chest', 'belly', 'back', 'upperArms', 'forearms', 'hands', 'waist', 'hips', 'thighs', 'lowerLegs', 'feet']),
};

/** Facing front the back is hidden; facing away the face, chest and belly are. */
const FACING_HIDES: Record<Camera['facing'], ReadonlySet<Zone>> = {
  front: new Set<Zone>(['back']),
  back: new Set<Zone>(['face', 'chest', 'belly', 'collar']),
};

export interface Piece {
  name: string;
  /** Body-region key ('Body/Torso', 'Body/Left Upper Leg/…/Left Foot'). */
  region: string;
  category?: string | null;
  material?: string | null;
  description?: string | null;
  /** How THIS one looks, as a noun phrase ("a blue Chess Pizza polo with the red, white and blue logo") — painted
   *  instead of name + material (2026-10-17: the painter only saw "a chess pizza visor of cotton" and invented a white one). */
  look?: string | null;
}

export interface Layer {
  piece: Piece;
  covers: Zone[];
  /** Open down the front: chest/belly show the next layer in. */
  open: boolean;
  /** Covers the collarbone only at its edge (crew and scoop necks). */
  edgeAtCollar: boolean;
  /** 0 = outermost … higher = closer to the skin. */
  depth: number;
  /** Jewellery and such: seen where it sits, covers nothing. */
  ornament: boolean;
  /** Underwear: never named when anything lies over it. */
  under: boolean;
  /** A coat, jacket or open-front garment the pose can open or pull closed. */
  opens: boolean;
}

const has = (re: RegExp, ...s: Array<string | null | undefined>) => s.some(x => !!x && re.test(x));

/** One equipped piece → the layer it makes on the body. Pure. */
export function layerOf(p: Piece): Layer {
  const n = p.name.toLowerCase();
  const d = (p.description ?? '').toLowerCase();
  const r = p.region.toLowerCase();
  const leaf = r.split('/').pop() ?? r;
  const base: Omit<Layer, 'covers' | 'depth'> = { piece: p, open: false, edgeAtCollar: false, ornament: false, under: false, opens: false };

  // Ornaments first — a ring on a finger covers nothing.
  // Crosses and prayer ropes too (2026-10-17: Kristopher's wrist prayer rope was read as a garment).
  if (/\b(ring|watch|bracelet|bangle|necklace|pendant|chain|earrings?|stud|anklet|locket|choker|cross|crucifix|rosary|prayer rope|chotki|komboskini)\b/.test(n)) {
    const at: Zone = /\b(earrings?|stud)\b/.test(n) ? 'face' : /\b(necklace|pendant|chain|locket|choker|cross|crucifix)\b/.test(n) ? 'neck'
      : /\banklet\b/.test(n) ? 'feet' : /\b(watch|bracelet|bangle|rosary|prayer rope|chotki|komboskini)\b/.test(n) ? 'forearms' : 'hands';
    return { ...base, covers: [at], depth: -1, ornament: true };
  }
  // Feet, hands, head, neck by where it is worn.
  if (/\b(foot|feet|toes?)\b/.test(leaf) || /\b(boots?|shoes?|socks?|sandals?|slippers?|sneakers?|heels|loafers?)\b/.test(n)) {
    return { ...base, covers: /\bboots?\b/.test(n) ? ['feet', 'lowerLegs'] : ['feet'], depth: /\bsocks?\b/.test(n) ? 2 : 0, under: /\bsocks?\b/.test(n) };
  }
  if (/\b(hand|fingers?)\b/.test(leaf) || /\b(gloves?|mittens?|gauntlets?)\b/.test(n)) return { ...base, covers: ['hands'], depth: 0 };
  if (/\b(head|face|scalp)\b/.test(leaf) || /\b(hat|cap|beanie|hood|helmet|mask|veil|balaclava)\b/.test(n)) {
    return { ...base, covers: /\b(mask|balaclava|veil)\b/.test(n) ? ['face'] : ['scalp'], depth: 0 };
  }
  if (/\b(neck|throat)\b/.test(leaf) || /\b(scarf|cowl|collar|gorget)\b/.test(n)) return { ...base, covers: ['neck', 'collar'], depth: 0 };

  // Underwear.
  if (/\b(bra|bralette|bikini top|bust(ier)?)\b/.test(n)) return { ...base, covers: ['chest'], depth: 3, under: true };
  if (/\b(underwear|briefs|panties|boxers|knickers|thong)\b/.test(n)) return { ...base, covers: ['hips'], depth: 3, under: true };
  if (/\b(undershirt|thermal|base layer)\b/.test(n)) return { ...base, covers: ['chest', 'belly', 'back', 'upperArms', 'forearms'], depth: 3, under: true };

  // Legs.
  const onLegs = /\b(leg|thigh|hip|waist|pelvis)\b/.test(r);
  if (onLegs || /\b(jeans|pants|trousers|leggings|slacks|chinos|shorts|skirt|kilt|sweatpants|joggers)\b/.test(n)) {
    const covers: Zone[] = /\bshorts\b/.test(n) ? ['waist', 'hips', 'thighs']
      : /\b(skirt|kilt)\b/.test(n) ? ['waist', 'hips', 'thighs'] : ['waist', 'hips', 'thighs', 'lowerLegs'];
    return { ...base, covers, depth: 1 };
  }

  // Torso and whole-body garments.
  const outer = /\b(coat|parka|jacket|blazer|cloak|poncho|raincoat|anorak|overcoat)\b/.test(n);
  const mid = /\b(cardigan|sweater|jumper|hoodie|sweatshirt|flannel|kimono|shrug|robe|vest|waistcoat)\b/.test(n);
  const openByNature = /\b(cardigan|kimono|shrug|robe)\b/.test(n);
  const open = has(/\b(open|unbuttoned|unzipped|hangs? open|hanging open|loose over)\b/, d) || (openByNature && !has(/\b(buttoned|zipped|closed|fastened)\b/, d));
  const sleeveless = /\b(tank|camisole|cami|vest|waistcoat|halter|strapless|tube top|sleeveless)\b/.test(n) || has(/\bsleeveless\b/, d);
  const short = /\b(tee|t-shirt|tshirt|polo|short[- ]sleeved?)\b/.test(n) || has(/\bshort[- ]sleeved?\b/, d);
  const rolled = has(/\b(sleeves? (rolled|pushed)( up)?|rolled sleeves|pushed[- ]up sleeves)\b/, d);
  const crop = /\bcrop\b/.test(n);
  const dress = /\b(dress|gown|frock|jumpsuit|overalls|outfit|uniform)\b/.test(n);
  const high = /\b(turtleneck|roll[- ]?neck|mock[- ]?neck|high[- ]neck)\b/.test(n) || has(/\b(turtleneck|high neck|buttoned to the (throat|top))\b/, d);
  const low = /\b(v[- ]?neck|scoop|off[- ]the[- ]shoulder|tank|camisole|cami|halter|strapless|tube top)\b/.test(n) || has(/\b(v-neck|low neck|open collar)\b/, d) || open;

  const covers: Zone[] = ['chest', 'back'];
  if (!crop) covers.push('belly');
  if (!sleeveless) covers.push('upperArms');
  if (!sleeveless && !short && !rolled) covers.push('forearms');
  if (high) covers.push('neck', 'collar');
  if (dress) covers.push('waist', 'hips', 'thighs');
  if (/\b(coat|parka|overcoat|raincoat|cloak|robe)\b/.test(n)) covers.push('waist', 'hips', 'thighs');
  const opens = outer || openByNature || /\b(zip[- ]?up|button[- ]?up)\b/.test(n) || has(/\b(zip|zipped|unzipped|buttons?|buttoned|unbuttoned)\b/, d);
  return { ...base, covers, open, opens: opens && (outer || mid), edgeAtCollar: !high && !low && !sleeveless, depth: outer ? 0 : mid ? 1 : 2 };
}

/** The layer as the pose has it lie: sleeves pushed up bare the forearms; a held-closed cardigan is closed. Pure. */
export function poseLayer(l: Layer, fx: PoseEffects): Layer {
  if (l.ornament || l.under) return l;
  let out = l;
  if (fx.sleevesUp && l.covers.includes('forearms') && l.covers.includes('chest')) out = { ...out, covers: out.covers.filter(z => z !== 'forearms') };
  if (fx.open !== null && l.opens) out = { ...out, open: fx.open };
  return out;
}

const TURNED = /\b(half[- ]turn(ed)?|three[- ]quarters?|turned (away|aside|side[- ]?on|half away)|side[- ]on|in profile|angled away)\b/i;
const NEAR_SIDE = /\b(left|right) (shoulder|side|arm) (is )?(toward|towards|to|nearest|nearer|closest to|facing) the (viewer|camera)\b/i;
const FAR_SIDE = /\b(left|right) (shoulder|side|arm) (is )?(turned )?away\b/i;
const FACING_AWAY = /\b(back to the (viewer|camera)|facing away|seen from behind|back turned)\b/i;
const SLEEVES_UP = /\b(sleeves? (are |were )?(pushed|rolled|shoved|hiked|tugged) (up|back)|(pushed|rolled)[- ]up sleeves|sleeves? (pushed|rolled) to the elbows?)\b/i;
const HELD_CLOSED = /\b((pulled|drawn|wrapped|held|clutched|hugged) (\w+ )?(closed|shut|tight)|(buttoned|zipped) (up|to the (throat|top|chin)))\b/i;
const HANGING_OPEN = /\b((hangs?|hanging|falls?|falling|left) open|unbuttoned|unzipped|open over)\b/i;

const other = (s: Side): Side => (s === 'left' ? 'right' : 'left');

/**
 * The camera and the way the clothes lie, read from the pose words (the engine
 * owns this — Mike 2026-10-16: "the engine will have to do this"). A turn that
 * names no shoulder is given the left one, and the pose says so, so the
 * painter and the engine agree. Pure.
 */
export function readPose(pose: string, frame: Camera['frame'] = 'bust'): { camera: Camera; effects: PoseEffects; pose: string } {
  const facing: Camera['facing'] = FACING_AWAY.test(pose) ? 'back' : 'front';
  let near: Side | null = null;
  let text = pose;
  const n = NEAR_SIDE.exec(pose);
  const f = FAR_SIDE.exec(pose);
  if (n) near = n[1].toLowerCase() as Side;
  else if (f) near = other(f[1].toLowerCase() as Side);
  else if (facing === 'front' && TURNED.test(pose)) {
    near = 'left';
    text = `${pose.trim().replace(/[.,;]+$/, '')}, the left shoulder toward the viewer`;
  }
  const effects: PoseEffects = {
    sleevesUp: SLEEVES_UP.test(pose),
    open: HELD_CLOSED.test(pose) ? false : HANGING_OPEN.test(pose) ? true : null,
  };
  return { camera: { frame, facing, near }, effects, pose: text };
}

export interface SeenPiece {
  piece: Piece;
  /** The layer it hangs open over in the frame, if any. */
  openOver: Piece | null;
  /** In frame only at its top edge (the waistband in a waist-up frame). */
  atWaistOnly: boolean;
}

export interface MarkView {
  mark: string;
  zone: Zone | null;
  view: 'shown' | 'edge' | 'hidden';
  /** The piece whose edge half-hides it ('edge'). */
  by?: Piece;
}

export interface Visibility {
  seen: SeenPiece[];
  unseen: Piece[];
  marks: MarkView[];
}

// Where a mark sits, by its words — the FIRST place named wins
// ("777 running down … her tattoo on her arm" → arm).
const MARK_ZONE: Array<[RegExp, Zone]> = [
  [/\b(scalp|hairline|crown)\b/i, 'scalp'],
  [/\b(face|eyebrows?|eyes?|eyelids?|lips?|mouth|nose|nostrils?|ears?|earlobes?|cheeks?|forehead|temples?|jaw|chin)\b/i, 'face'],
  [/\b(clavicles?|collarbones?)\b/i, 'collar'],
  [/\b(neck|throat|nape)\b/i, 'neck'],
  [/\b(hands?|fingers?|knuckles?|palms?|thumbs?)\b/i, 'hands'],
  [/\b(wrists?|forearms?|elbows?|arms?|sleeve)\b/i, 'forearms'],
  [/\b(upper arms?|biceps?|shoulders?)\b/i, 'upperArms'],
  [/\b(belly|navel|belly button|stomach|abdomen|midriff)\b/i, 'belly'],
  [/\b(chest|breasts?|sternum|ribs?|ribcage|cleavage)\b/i, 'chest'],
  [/\b(back|spine|shoulder blades?|nape)\b/i, 'back'],
  [/\b(waist|hips?|pelvis)\b/i, 'hips'],
  [/\b(thighs?)\b/i, 'thighs'],
  [/\b(knees?|calf|calves|shins?|ankles?|legs?)\b/i, 'lowerLegs'],
  [/\b(feet|foot|toes?|soles?)\b/i, 'feet'],
];

/** The zone a mark sits on, from its words. Null when it does not say. Pure. */
export function markZone(mark: string): Zone | null {
  let best: { at: number; zone: Zone } | null = null;
  for (const [re, zone] of MARK_ZONE) {
    const hit = re.exec(mark);
    if (hit && (!best || hit.index < best.at)) best = { at: hit.index, zone };
  }
  return best?.zone ?? null;
}

const OPEN_ZONES: ReadonlySet<Zone> = new Set<Zone>(['chest', 'belly', 'collar']);
const SIDED_ZONES: ReadonlySet<Zone> = new Set<Zone>(['upperArms', 'forearms', 'hands']);

// "right above her navel" is a place, not a side.
const SIDE_WORD = /\b(left|right(?!\s+(above|below|under|beneath|over|next|beside|by|at|on|in|through|across|along|between|where|there|here|away|up|down)\b))\b/i;

/** The side of the body a mark or piece names (null = it does not say). Pure. */
export function sideOf(text: string): Side | null {
  const m = SIDE_WORD.exec(text);
  return m ? (m[1].toLowerCase() as Side) : null;
}

/** Behind the body in a half-turn: the far arm, and the far ear. Pure. */
function onFarSide(zone: Zone, side: Side | null, text: string, camera: Camera): boolean {
  if (!camera.near || !side || side === camera.near) return false;
  return SIDED_ZONES.has(zone) || (zone === 'face' && /\b(ears?|earlobes?)\b/i.test(text));
}

/**
 * The camera's view of the dressed body. For every zone in frame and facing the
 * camera, the outermost layer is what shows — except down the front of an
 * open garment, where the next layer in shows too. The pose changes how the
 * layers lie; a half-turn puts the far arm behind the body. Pure.
 */
export function viewBody(pieces: Piece[], marks: string[], camera: Camera = PORTRAIT_CAMERA, effects: PoseEffects = NO_POSE_EFFECTS): Visibility {
  const inFrame = FRAME_ZONES[camera.frame];
  const visibleZone = (z: Zone) => inFrame.has(z) && !FACING_HIDES[camera.facing].has(z);
  const layers = pieces.map(p => poseLayer(layerOf(p), effects));
  const cloth = layers.filter(l => !l.ornament);

  /** The layers that cover a zone, outermost first. */
  const stack = (z: Zone) => cloth.filter(l => l.covers.includes(z)).sort((a, b) => a.depth - b.depth);

  const seenSet = new Map<Piece, SeenPiece>();
  const see = (l: Layer, z: Zone, openOver: Piece | null) => {
    const cur = seenSet.get(l.piece);
    const waistOnly = camera.frame === 'bust' && z === 'waist';
    if (!cur) seenSet.set(l.piece, { piece: l.piece, openOver, atWaistOnly: waistOnly });
    else {
      if (!waistOnly) cur.atWaistOnly = false;
      if (openOver && !cur.openOver) cur.openOver = openOver;
    }
  };

  for (const z of inFrame) {
    if (!visibleZone(z)) continue;
    const s = stack(z);
    if (s.length === 0) continue;
    // Equal-depth layers sit side by side (the left boot and the right boot), not one over the other.
    for (const l of s) if (l.depth === s[0].depth) see(l, z, null);
    if (s[0].open && OPEN_ZONES.has(z) && s[1]) {
      seenSet.get(s[0].piece)!.openOver = s[1].piece;
      see(s[1], z, null);
    }
  }
  for (const l of layers.filter(x => x.ornament)) {
    const z = l.covers[0];
    if (!visibleZone(z) || onFarSide(z, sideOf(`${l.piece.region} ${l.piece.name}`), l.piece.name, camera)) continue;
    // A watch under a long sleeve is not seen.
    const over = stack(z)[0];
    if (!over || (over.open && OPEN_ZONES.has(z))) seenSet.set(l.piece, { piece: l.piece, openOver: null, atWaistOnly: false });
  }

  const seen = [...seenSet.values()];
  const unseen = pieces.filter(p => !seenSet.has(p));

  const markViews: MarkView[] = marks.map(mark => {
    const zone = markZone(mark);
    if (!zone) return { mark, zone, view: 'shown' as const }; // better shown than lost
    if (!visibleZone(zone) || onFarSide(zone, sideOf(mark), mark, camera)) return { mark, zone, view: 'hidden' as const };
    const s = stack(zone);
    const top = s[0];
    if (top && top.open && OPEN_ZONES.has(zone)) {
      const next = s[1];
      if (!next) return { mark, zone, view: 'shown' as const };
      if (zone === 'collar' && next.edgeAtCollar) return { mark, zone, view: 'edge' as const, by: next.piece };
      return { mark, zone, view: 'hidden' as const };
    }
    if (!top) {
      // The collarbone just above a crew or scoop neckline is half-covered by its edge.
      const edge = zone === 'collar' ? cloth.find(l => l.edgeAtCollar && l.covers.includes('chest')) : undefined;
      return edge ? { mark, zone, view: 'edge' as const, by: edge.piece } : { mark, zone, view: 'shown' as const };
    }
    return { mark, zone, view: 'hidden' as const };
  });

  return { seen, unseen, marks: markViews };
}

// ── Words ───────────────────────────────────────────────────────────────

function article(name: string): string {
  const n = name.trim();
  if (!n) return '';
  if (/^(a|an|the|her|his|their|some)\s/i.test(n) || /s$/i.test(n)) return n.toLowerCase();
  return `${/^[aeiou]/i.test(n) ? 'an' : 'a'} ${n.toLowerCase()}`;
}

const named = (p: Piece) => p.look?.trim() ? p.look.trim().replace(/[.\s]+$/, '') : `${article(p.name)}${p.material ? ` of ${p.material.toLowerCase()}` : ''}`;

const BODY_ORDER: Zone[] = ['scalp', 'face', 'neck', 'collar', 'chest', 'belly', 'back', 'upperArms', 'forearms', 'hands', 'waist', 'hips', 'thighs', 'lowerLegs', 'feet'];
/** Head to feet, then outermost first. */
const bodyRank = (p: Piece) => {
  const l = layerOf(p);
  return Math.min(...l.covers.map(z => BODY_ORDER.indexOf(z))) * 10 + l.depth;
};

/** "The left black boot" + "The right black boot" → one name, "the black boots" (null when not a pair). Pure. */
function pairName(a: Piece, b: Piece): string | null {
  const strip = (n: string) => n.replace(/\b(left|right)\s+/i, '').trim().toLowerCase();
  const sa = sideOf(a.name); const sb = sideOf(b.name);
  if (!sa || !sb || sa === sb || strip(a.name) !== strip(b.name) || (a.material ?? '') !== (b.material ?? '')) return null;
  const plural = strip(a.name).replace(/(s|sh|ch|x)$/, '$1e').replace(/$/, 's');
  return named({ ...a, name: plural });
}

/**
 * The clothes clause: ONLY what the camera sees, outer to inner, "hanging open
 * over" where a layer lies open; the trousers named "at the waist" in a
 * waist-up frame; underwear never named when anything lies over it. Pure.
 */
export function clothesClause(v: Visibility, pronoun: 'she' | 'he' | 'they'): string {
  const seen = v.seen.filter(s => !(layerOf(s.piece).under && v.seen.some(o => o !== s && !layerOf(o.piece).under && !layerOf(o.piece).ornament)));
  if (seen.length === 0) return `in the clothes ${pronoun} would wear at home`;
  const done = new Set<Piece>();
  const parts: string[] = [];
  const ordered = [...seen].sort((a, b) => bodyRank(a.piece) - bodyRank(b.piece));
  for (const s of ordered) {
    if (done.has(s.piece) || layerOf(s.piece).ornament) continue;
    done.add(s.piece);
    const twin = ordered.find(o => !done.has(o.piece) && pairName(s.piece, o.piece));
    if (twin) {
      done.add(twin.piece);
      parts.push(pairName(s.piece, twin.piece)!);
    } else if (s.openOver && seen.some(x => x.piece === s.openOver)) {
      done.add(s.openOver);
      parts.push(`${named(s.piece)} hanging open over ${named(s.openOver)}`);
    } else if (s.atWaistOnly) {
      parts.push(`${named(s.piece)} at the waist`);
    } else {
      parts.push(named(s.piece));
    }
  }
  for (const s of seen) if (layerOf(s.piece).ornament) parts.push(named(s.piece));
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `wearing ${list}`;
}

/** The marks clause: the bare ones kept exactly; edge ones "half-hidden by the edge of …"; covered ones never named. Pure. */
export function marksClause(v: Visibility): string {
  const out = v.marks.flatMap(m => m.view === 'shown' ? [m.mark]
    : m.view === 'edge' && m.by ? [`${m.mark}, half-hidden by the edge of ${article(m.by.name)}`] : []);
  return out.length ? `keeping every mark exactly as it is — ${out.join('; ')}` : '';
}
