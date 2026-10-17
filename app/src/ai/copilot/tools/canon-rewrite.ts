/**
 * CANON REWRITE MODE tools (Mike 2026-10-17) — temporary, first campaign.
 * read_canon / rewrite_trait / rewrite_memory / undo_canon_rewrite. Every
 * handler refuses unless the mode is on AND the actor is the ADMIN running
 * the campaign as GM (services/canon-rewrite.ts). Applied at once, archived,
 * undoable. See [[ruling-canon-rewrite-mode-first-campaign-2026-10-17]].
 */

import 'server-only';
import {
  readCanon, readCanonSchema, rewriteMemory, rewriteMemorySchema,
  rewriteTrait, rewriteTraitSchema, undoCanonRewrite, undoCanonRewriteSchema,
} from '@/services/canon-rewrite';
import { registerJewlTool } from './registry';
import type { JewlTool } from './types';

const OFF_NOTE = 'Only in CANON REWRITE MODE, for the ADMIN running this campaign as GM.';

export const readCanonTool: JewlTool = {
  name: 'read_canon',
  description: `CANON REWRITE MODE: a character's traits (nectars, thorns, blossoms: link id, name, this character's story, the blueprint's description + mechanical effect) and memories with ids (query = words to find them). Read before rewrite_trait / rewrite_memory. ${OFF_NOTE}`,
  inputSchema: readCanonSchema,
  handler: async (input, ctx) => ({ output: await readCanon(ctx.campaignId, ctx.actorId, ctx.actorRole, input) }),
};

export const rewriteTraitTool: JewlTool = {
  name: 'rewrite_trait',
  description: `CANON REWRITE MODE: rewrite a trait from what the GM just played. scope 'instance' = this character's copy (localName / story) — the default; 'blueprint' = the Forge trait itself for every bearer (name / description / mechanicalEffect) — only when the fix is about the trait. Applied at once, archived, undoable. ${OFF_NOTE}`,
  inputSchema: rewriteTraitSchema,
  handler: async (input, ctx) => {
    const r = await rewriteTrait(ctx.campaignId, ctx.actorId, ctx.actorRole, input);
    return { output: r, affected: { characters: [{ id: (input as { characterId: string }).characterId, changes: ['traits'] }] } };
  },
};

export const rewriteMemoryTool: JewlTool = {
  name: 'rewrite_memory',
  description: `CANON REWRITE MODE: fix a memory from what the GM just played — op 'rewrite' (new text), 'retire' (it is not true; archived), or 'add' (one the play revealed; atAge = her age then). Applied at once, archived, undoable. ${OFF_NOTE}`,
  inputSchema: rewriteMemorySchema,
  handler: async (input, ctx) => ({ output: await rewriteMemory(ctx.campaignId, ctx.actorId, ctx.actorRole, input) }),
};

export const undoCanonRewriteTool: JewlTool = {
  name: 'undo_canon_rewrite',
  description: `CANON REWRITE MODE: the GM said "undo" — put back a rewrite exactly as it was (rewriteId, or omit for the most recent). ${OFF_NOTE}`,
  inputSchema: undoCanonRewriteSchema,
  handler: async (input, ctx) => ({ output: await undoCanonRewrite(ctx.campaignId, ctx.actorId, ctx.actorRole, input) }),
};

registerJewlTool(readCanonTool);
registerJewlTool(rewriteTraitTool);
registerJewlTool(rewriteMemoryTool);
registerJewlTool(undoCanonRewriteTool);
