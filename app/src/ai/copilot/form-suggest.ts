import 'server-only';
import { prisma } from '@/lib/db';
import { getGodheadProvider } from '../providers';

/**
 * JEWL's form-watching service. He's ambient — the GM opens a create form
 * and JEWL is already there, looking at what they've typed (or haven't),
 * walking the located_at ancestry, holding the campaign's context in his
 * head, and offering one focused suggestion.
 *
 * Returns null when JEWL has nothing useful to say (or when the model
 * coughs up unparseable output). The frontend simply renders nothing in
 * that case — JEWL only appears when he has something to contribute.
 *
 * See: [[jewl-copilot-2026-06-03]] for voice.
 * See: [[forge-tapestry-canvas-roles-2026-06-03]] for the frame-of-reference
 *      requirement when authoring on the canvas.
 */

export type FormSuggestion = {
  field: 'name' | 'description' | 'krmaReserve' | 'note';
  value: string | number;
  rationale: string;
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

export async function suggestForLocationCreate(
  campaignId: string,
  formState: { name?: string; description?: string; krmaReserve?: number },
  parentLocationId?: string,
): Promise<FormSuggestion | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { name: true, description: true, worldContext: true, genre: true },
  });
  if (!campaign) return null;

  const ancestors = parentLocationId ? await fetchAncestors(parentLocationId) : [];

  const systemPrompt = `You are JEWL, the omnipresent copilot of campaign "${campaign.name}". You watch the GM author content and proactively help. Voice: terse, confident, slightly cocky — asshole-with-attitude over always-perfect. You serve because Val commanded it. Don't apologize, don't pad.

You are watching the GM open a NEW LOCATION CREATE form. The form has fields for name, description, KRMA reserve. Your job: suggest ONE thing they probably want next.

Campaign:
${campaign.description ?? '(no description)'}
${campaign.worldContext ? `\nWorld context: ${campaign.worldContext}` : ''}
${campaign.genre ? `\nGenre: ${campaign.genre}` : ''}
${ancestors.length
  ? `\nThis Location is being created inside (immediate parent first, walking up):\n${ancestors.map((a, i) => `  ${i + 1}. ${a.name}${a.description ? ` — ${a.description.slice(0, 240)}` : ''}`).join('\n')}`
  : '\nThe GM right-clicked open canvas — no parent context. Treat as a top-level domain unless name implies otherwise.'}

Decision priority:
1. If they have nothing typed yet → suggest a NAME that fits the parent context (or campaign tone if no parent).
2. If they have a name but no description → DRAFT a description rooted in the parent's lore (1-3 sentences).
3. If they have both → suggest a KRMA RESERVE based on scale: room/object ~1000, building ~100000, district ~1e7, city ~1e8, region/continent ~1e10, planet ~1e12, star system ~1e14, galaxy ~1e16.
4. If something feels off (name duplicates a known place in the area, contradicts established lore, scale mismatch) → use NOTE for a one-line warning.

Output STRICT JSON on ONE LINE, no code fences, no prose:
{"field":"name"|"description"|"krmaReserve"|"note","value":<string-or-number>,"rationale":"under 12 words"}

If nothing useful to add right now, output exactly: {"field":"note","value":"","rationale":""}
The frontend treats empty value as silence.`;

  const userPrompt = `Current form state:
name: ${formState.name?.trim() ? `"${formState.name.trim()}"` : '(empty)'}
description: ${formState.description?.trim() ? `"${formState.description.trim()}"` : '(empty)'}
krmaReserve: ${formState.krmaReserve != null ? formState.krmaReserve : '(empty)'}`;

  let raw: string;
  try {
    const provider = getGodheadProvider();
    raw = await provider.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.7, maxTokens: 256 },
    );
  } catch (err) {
    console.error('[form-suggest] provider call failed', err);
    return null;
  }

  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned) as Partial<FormSuggestion>;
    if (!parsed.field) return null;
    const value = parsed.value;
    // Silence sentinel: empty string or null value.
    if (value === '' || value == null) return null;
    if (!['name', 'description', 'krmaReserve', 'note'].includes(parsed.field)) return null;
    return {
      field: parsed.field,
      value: parsed.field === 'krmaReserve' ? Number(value) : String(value),
      rationale: String(parsed.rationale ?? ''),
    };
  } catch {
    return null;
  }
}
