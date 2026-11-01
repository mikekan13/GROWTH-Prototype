/**
 * consume_item — a thing is used up, eaten, lost or destroyed (2026-11-01: Violet still held Friday's pizza on Monday
 * night; nothing could take it out of the world). Object permanence runs both ways: what is gone is marked gone, with
 * why on its ledger, never deleted.
 */
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const inputSchema = z.object({
  item: z.string().min(1).max(200).describe('The thing, by exact local name or id.'),
  how: z.enum(['CONSUMED', 'LOST', 'DESTROYED']).describe('CONSUMED = eaten, used up, spent; LOST = gone from anyone\'s knowledge; DESTROYED = broken past use.'),
  because: z.string().min(3).max(300).describe('What happened, one line, for the object\'s ledger ("eaten Friday night at the desk").'),
});

export const consumeItemTool: JewlTool = {
  name: 'consume_item',
  description:
    'A thing leaves the world: eaten, used up, lost or destroyed. Marks it so (never deletes) and writes why on its ledger. ' +
    'For PART of a thing (one bill out of a wad, two arrows from twenty) do not use this — compose_item the remainder instead.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const p = inputSchema.parse(input);
    const rows = await prisma.campaignItem.findMany({ where: { campaignId: ctx.campaignId, status: 'ACTIVE', OR: [{ id: p.item.trim() }, { name: p.item.trim() }] } });
    const row = rows.find((r) => r.id === p.item.trim()) ?? rows.find((r) => r.name.toLowerCase() === p.item.trim().toLowerCase());
    if (!row) return { output: { ok: false, reason: `no thing called "${p.item}" in this campaign (exact local name or id)` } };
    let history: unknown[] = [];
    try { history = JSON.parse(row.history || '[]'); } catch { history = []; }
    history.push({ kind: p.how.toLowerCase(), at: new Date().toISOString(), text: p.because.trim() });
    await prisma.campaignItem.update({ where: { id: row.id }, data: { status: p.how, holderId: null, history: JSON.stringify(history) } });
    await prisma.entityRelationship.deleteMany({ where: { sourceId: row.id, relationshipType: 'located_at' } }).catch(() => undefined);
    return { output: { ok: true, item: row.name, id: row.id, status: p.how }, affected: { items: [{ id: row.id }] } };
  },
};

registerJewlTool(consumeItemTool);
