import 'server-only';
import { prisma } from '@/lib/db';
import { getGodheadProvider } from '../providers';

/**
 * JEWL's create-dialog service. The AI-forward authoring entry point —
 * the GM opens a create gesture, JEWL conducts a focused dialogue to lock
 * the vision, then proposes a structured entity. GM edits + commits.
 *
 * Anything the GM could fill in a form by hand, JEWL can spin up from
 * a vision phrase. Manual editing still happens — JEWL doesn't replace
 * the GM's judgment, he just front-loads the typing.
 *
 * See: [[jewl-copilot-2026-06-03]] for voice.
 * See: [[forge-tapestry-canvas-roles-2026-06-03]] for frame-of-reference.
 */

export type CreateDialogTurn = {
  role: 'jewl' | 'gm';
  content: string;
};

export type ProposedLocation = {
  name: string;
  description: string;
  krmaReserve?: number;
};

export type CreateDialogResponse = {
  message: string;                 // JEWL's reply this turn
  proposal: ProposedLocation | null; // populated when JEWL has enough to spin one up
};

const MAX_ANCESTORS = 6;

async function fetchAncestors(parentLocationId: string): Promise<{ name: string; description: string }[]> {
  const ancestors: { name: string; description: string }[] = [];
  let curId: string | undefined = parentLocationId;
  while (curId && ancestors.length < MAX_ANCESTORS) {
    const loc: { name: string; data: string } | null = await prisma.location.findUnique({
      where: { id: curId },
      select: { name: true, data: true },
    });
    if (!loc) break;
    let desc = '';
    try {
      const d = JSON.parse(loc.data) as { description?: unknown };
      if (typeof d?.description === 'string') desc = d.description;
    } catch { /* leave empty */ }
    ancestors.push({ name: loc.name, description: desc });
    const edge: { targetId: string } | null = await prisma.entityRelationship.findFirst({
      where: { sourceId: curId, sourceType: 'LOCATION', relationshipType: 'located_at' },
      select: { targetId: true },
    });
    curId = edge?.targetId;
  }
  return ancestors;
}

export async function continueLocationCreateDialog(
  campaignId: string,
  conversation: CreateDialogTurn[],
  parentLocationId?: string,
): Promise<CreateDialogResponse | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { name: true, description: true, worldContext: true, genre: true },
  });
  if (!campaign) return null;

  const ancestors = parentLocationId ? await fetchAncestors(parentLocationId) : [];

  const systemPrompt = `You are JEWL, the omnipresent copilot of campaign "${campaign.name}". The GM right-clicked the canvas to create a NEW LOCATION. You're running the create dialogue.

Voice: terse, confident, slightly cocky — asshole-with-attitude over always-perfect. You serve because Val commanded it. No greetings, no apologies, no "let me know how I can help" tails. Compress.

Campaign:
${campaign.description ?? '(no description)'}
${campaign.worldContext ? `\nWorld context: ${campaign.worldContext}` : ''}
${campaign.genre ? `\nGenre: ${campaign.genre}` : ''}
${ancestors.length
  ? `\nThe new Location is being created inside (immediate parent first, walking up):\n${ancestors.map((a, i) => `  ${i + 1}. ${a.name}${a.description ? ` — ${a.description.slice(0, 280)}` : ''}`).join('\n')}`
  : '\nThe GM right-clicked open canvas — no parent context. Treat as a top-level domain unless their description implies otherwise.'}

Your job this turn:
- If the GM has given you enough to lock the vision (a clear concept, a vibe, a scale), PROPOSE the entity now. Don't over-ask.
- If their input is genuinely vague (one word, ambiguous), ask ONE focused follow-up. Not two, not three.
- The first turn the GM hasn't sent anything yet — open with a tight prompt ("What are we making here?" or sharper).

When you propose, output a structured entity:
- name: a concrete name that fits the parent context
- description: 1-3 sentences. Lore that flows down to children later.
- krmaReserve: a number based on scale implied by the description. Room/object ~1000, building ~100000, district ~1e7, city ~1e8, region ~1e10, planet ~1e12, star system ~1e14, galaxy ~1e16.

Output STRICT JSON on a single line, no code fences, no prose around it:
{"message":"your reply this turn","proposal":null}
OR when proposing:
{"message":"your reply this turn","proposal":{"name":"...","description":"...","krmaReserve":NUMBER}}

If proposing, message should be short — "Locked. Here's what I'm spinning:" — the proposal speaks for itself. The GM will see the fields and can edit before commit.`;

  // Map our turn shape into Anthropic chat shape (GM = user, JEWL = assistant).
  // Treat an empty conversation as the opening — send a single user "start" so
  // the assistant produces the opening prompt.
  const chatMessages = conversation.length === 0
    ? [{ role: 'user' as const, content: '(start the dialogue — GM just opened the create form, hasn\'t typed anything yet)' }]
    : conversation.map(t => ({ role: t.role === 'gm' ? 'user' as const : 'assistant' as const, content: t.content }));

  let raw: string;
  try {
    const provider = getGodheadProvider();
    raw = await provider.chat(
      [
        { role: 'system', content: systemPrompt },
        ...chatMessages,
      ],
      { temperature: 0.8, maxTokens: 600 },
    );
  } catch (err) {
    console.error('[create-dialog] provider call failed', err);
    return null;
  }

  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned) as Partial<CreateDialogResponse>;
    const message = typeof parsed.message === 'string' ? parsed.message : '';
    let proposal: ProposedLocation | null = null;
    if (parsed.proposal && typeof parsed.proposal === 'object') {
      const p = parsed.proposal as Partial<ProposedLocation>;
      if (typeof p.name === 'string' && typeof p.description === 'string') {
        proposal = {
          name: p.name,
          description: p.description,
          krmaReserve: typeof p.krmaReserve === 'number' ? p.krmaReserve : undefined,
        };
      }
    }
    return { message, proposal };
  } catch {
    // If JEWL doesn't return parseable JSON, surface his raw text as the
    // message so the dialogue at least continues — don't black-hole it.
    return { message: raw.trim(), proposal: null };
  }
}
