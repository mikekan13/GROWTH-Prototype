/**
 * Stock catalog tools — JEWL's window into the global Forge catalog.
 *
 * The catalog holds the ADMIN-graded stock library (modern-Earth items,
 * materials, vehicles, buildings, traits, roots, branches, skills).
 * Ruling (Mike 2026-08-06): stock is PUBLIC and FREE — pulling an entry
 * into a campaign never costs KRMA. Stock is already authored and graded,
 * so a pulled copy arrives `published` and place_item can instantiate it
 * without another approval round. The catalog doubles as JEWL's grading
 * framework: when authoring something with no stock equivalent, pull the
 * nearest entries and grade the new design against them.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { searchGlobalCatalog, pullFromGlobalCatalog } from '@/services/forge';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const CATALOG_TYPES = ['item', 'skill', 'nectar', 'thorn', 'blossom', 'root', 'branch', 'seed'] as const;

// ── search_catalog ───────────────────────────────────────────────────────

const searchSchema = z.object({
  query: z.string().max(200).optional().describe(
    'Text match against entry names AND descriptions — "kitchen" finds items whose description mentions kitchens.',
  ),
  type: z.enum(CATALOG_TYPES).optional().describe(
    'Materials, vehicles, and buildings are all type "item".',
  ),
  limit: z.number().int().min(1).max(50).optional().describe('Default 20.'),
  full: z.boolean().optional().describe(
    'Return complete data blocks instead of summaries. Use on a SMALL result set when you need full stats — e.g. grading anchors for a new design.',
  ),
});

/** Trimmed row: enough to recognize the entry and judge its grade. */
function summarize(entry: { id: string; name: string; type: string; karmicValue: number | null; data: Record<string, unknown> }) {
  const d = entry.data;
  const desc = typeof d.description === 'string'
    ? (d.description.length > 160 ? `${d.description.slice(0, 157)}…` : d.description)
    : undefined;
  return {
    id: entry.id,
    name: entry.name,
    type: entry.type,
    kv: entry.karmicValue,
    ...(desc ? { description: desc } : {}),
    ...(typeof d.itemType === 'string' ? { itemType: d.itemType } : {}),
    ...(typeof d.primaryMaterial === 'string' ? { primaryMaterial: d.primaryMaterial } : {}),
    ...(typeof d.rarity === 'number' ? { rarity: d.rarity } : {}),
    ...(typeof d.weightLbs === 'number' ? { weightLbs: d.weightLbs } : {}),
    ...(typeof d.pillar === 'string' ? { pillar: d.pillar } : {}),
    ...(typeof d.category === 'string' ? { category: d.category } : {}),
  };
}

export const searchCatalogTool: JewlTool = {
  name: 'search_catalog',
  description:
    'Search the global stock catalog — the ADMIN-graded starter library ' +
    '(items, materials, vehicles, buildings, traits, roots, branches, ' +
    'skills). Stock is public and FREE: pulling it costs no KRMA. Search ' +
    'here BEFORE authoring anything new; use full:true on close matches ' +
    'to read complete stats as grading anchors.',
  inputSchema: searchSchema,
  handler: async (input): Promise<JewlToolHandlerResult> => {
    const parsed = searchSchema.parse(input);
    const entries = await searchGlobalCatalog({
      type: parsed.type,
      query: parsed.query,
      limit: parsed.limit,
    });
    return {
      output: {
        ok: true,
        count: entries.length,
        ...(entries.length === (parsed.limit ?? 20)
          ? { note: 'Result set hit the limit — narrow the query or raise limit.' }
          : {}),
        entries: parsed.full
          ? entries.map(e => ({ id: e.id, name: e.name, type: e.type, kv: e.karmicValue, data: e.data }))
          : entries.map(summarize),
      },
    };
  },
};

// ── pull_from_catalog ────────────────────────────────────────────────────

const pullSchema = z.object({
  ref: z.string().min(1).max(200).describe('Catalog entry id or exact name.'),
  type: z.enum(CATALOG_TYPES).optional().describe('Disambiguates when two entry types share a name.'),
});

export const pullFromCatalogTool: JewlTool = {
  name: 'pull_from_catalog',
  description:
    'Pull a stock entry from the global catalog into this campaign as a ' +
    'published Forge blueprint. FREE — never costs KRMA. The copy is ' +
    'pre-approved stock: instantiate items with place_item fromForgeItem ' +
    'immediately, no approval batch needed unless you alter its mechanics.',
  inputSchema: pullSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = pullSchema.parse(input);
    const ref = parsed.ref.trim();

    const byId = await prisma.forgeItem.findFirst({
      where: { id: ref, isGlobal: true },
      select: { id: true },
    });
    let globalId = byId?.id ?? null;

    if (!globalId) {
      const byName = await prisma.forgeItem.findMany({
        where: { isGlobal: true, name: ref, ...(parsed.type ? { type: parsed.type } : {}) },
        select: { id: true, name: true, type: true },
        take: 3,
      });
      if (byName.length > 1) {
        return {
          output: {
            ok: false,
            reason: `"${ref}" matches multiple catalog entries — pass type or id.`,
            matches: byName,
          },
        };
      }
      globalId = byName[0]?.id ?? null;
    }

    if (!globalId) {
      return {
        output: {
          ok: false,
          reason: `No global catalog entry "${ref}"${parsed.type ? ` of type ${parsed.type}` : ''}. Search with search_catalog — the name must be exact.`,
        },
      };
    }

    const copy = await pullFromGlobalCatalog(globalId, ctx.campaignId, ctx.actorId, ctx.actorRole);
    return {
      output: {
        ok: true,
        blueprintId: copy.id,
        name: copy.name,
        type: copy.type,
        alreadyInCampaign: copy.alreadyExists,
        next: copy.type === 'item'
          ? 'Instantiate with place_item fromForgeItem.'
          : 'Blueprint is published in this campaign and ready to grant/apply.',
      },
    };
  },
};

registerJewlTool(searchCatalogTool);
registerJewlTool(pullFromCatalogTool);
