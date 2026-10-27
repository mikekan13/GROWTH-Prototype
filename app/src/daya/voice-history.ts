/**
 * What a being has already said inside its own head, from the record — the memory the voice filter and the replay guard
 * read (HW8 run 6). Two sources: its `being_thought` rows (the thought, and the card the builder made of it) and the
 * monologues kept in the declaration payloads (a voiced being's pre-listen lives there, not in a thought row).
 * Newest first. Never throws: unreadable = nothing to compare against.
 */
import 'server-only';
import { prisma } from '@/lib/db';

/** The being's last `n` recorded thoughts on this campaign, newest first, then the last three declaration monologues. */
export async function recentVoiceOf(campaignId: string, characterId: string, n = 3): Promise<string[]> {
  try {
    const rows = await prisma.campaignEvent.findMany({ where: { campaignId, type: 'being_thought', characterId }, orderBy: { createdAt: 'desc' }, take: n, select: { payload: true } });
    const out = rows.map((r) => { try { return (JSON.parse(r.payload) as { thought?: string }).thought ?? ''; } catch { return ''; } }).filter(Boolean);
    // THE REPLAY, second source (HW8 run 5): a voiced being's pre-listen monologue lives in the declaration payload
    // (`monologues: [{actorId, text}]`), not in a being_thought row — the last 3 declarations count too.
    try {
      const decls = await prisma.campaignEvent.findMany({ where: { campaignId, type: 'game_event', payload: { contains: '"monologues"' } }, orderBy: { createdAt: 'desc' }, take: 3, select: { payload: true } });
      for (const d of decls ?? []) {
        try {
          const ms = (JSON.parse(d.payload) as { monologues?: Array<{ actorId?: string; text?: string }> }).monologues ?? [];
          for (const m of ms) if (m.actorId === characterId && m.text?.trim()) out.push(m.text.trim());
        } catch { /* skip */ }
      }
    } catch { /* non-fatal */ }
    return out;
  } catch { return []; }
}

/**
 * The prose a being's last `n` CARDS put on the page — the scene line and the thought / action segments the builder made
 * (HW8 run 6: the standing-beat card repeated "The wood doesn't vibrate; it just *is*." from the card before it, a sentence
 * the raw thought comparison missed because the builder had re-set it). Newest first. Never throws.
 */
export async function recentCardTextsOf(campaignId: string, characterId: string, n = 3): Promise<string[]> {
  try {
    const rows = await prisma.campaignEvent.findMany({ where: { campaignId, type: 'being_thought', characterId }, orderBy: { createdAt: 'desc' }, take: n, select: { payload: true } });
    const out: string[] = [];
    for (const r of rows ?? []) {
      try {
        const p = JSON.parse(r.payload) as { scene?: string; segments?: Array<{ kind?: string; text?: string }> };
        if (p.scene) out.push(p.scene);
        for (const s of p.segments ?? []) if (s.text && s.kind !== 'speech') out.push(s.text);
      } catch { /* skip */ }
    }
    return out;
  } catch { return []; }
}
