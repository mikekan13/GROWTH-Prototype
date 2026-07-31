/**
 * edit_character_sheet — JEWL's structural sheet editor.
 *
 * The existing mutation tools cover play-time state (set_attribute_current,
 * apply_attribute_damage, apply_condition); this one covers AUTHORING —
 * name, attribute levels, skills — so a GM can shape a character
 * conversationally from any surface ("give Violet a d6 in Creative
 * Writing", "bump her pools to a human baseline"). Thin wrapper over
 * services/character.ts's updateCharacter, which owns the permission gate
 * (GM of record / ADMIN; ACTIVE characters are GM-only) and writes the
 * changelog. Targeted operations only — JEWL never writes a whole data
 * blob, so a confused model can't wipe a sheet.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { updateCharacter } from '@/services/character';
import { SKILL_GOVERNORS } from '@/types/growth';
import type { GrowthAttribute, GrowthFrequency, GrowthSkill, GrowthTrait, SkillGovernor } from '@/types/growth';
import { registerJewlTool } from './registry';
import { resolveCharacterRef } from './resolve-character';
import type { JewlTool, JewlToolHandlerResult } from './types';

const ATTRIBUTES = [
  'clout', 'celerity', 'constitution',
  'flow', 'frequency', 'focus',
  'willpower', 'wisdom', 'wit',
] as const;

const governorEnum = z.enum(SKILL_GOVERNORS as [SkillGovernor, ...SkillGovernor[]]);

const inputSchema = z.object({
  character: z.string().min(1).describe('Character id or name (e.g. "Violet").'),
  setName: z.string().min(1).max(100).optional().describe('Rename the character.'),
  setAttributes: z
    .array(
      z.object({
        attribute: z.enum(ATTRIBUTES),
        level: z.number().min(0).max(1000).optional().describe('Base attribute level (pool max before augments).'),
        current: z.number().min(0).optional().describe(
          'Current pool. Omit when setting level: a full pool follows the new max, a spent pool is clamped.',
        ),
      }),
    )
    .max(9)
    .optional(),
  setSkills: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        level: z.number().min(1).max(20).describe('1-3 flat, 4-5 d4, 6-7 d6, 8-11 d8, 12-19 d12, 20 d20.'),
        governors: z.array(governorEnum).min(1).max(3).optional().describe(
          'Governing attributes — REQUIRED when adding a new skill; optional when re-leveling an existing one.',
        ),
        description: z.string().max(500).optional(),
      }),
    )
    .max(20)
    .optional()
    .describe('Upserts by skill name (case-insensitive).'),
  removeSkills: z.array(z.string().min(1)).max(20).optional(),
  setTraits: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        type: z.enum(['nectar', 'thorn']).optional().describe(
          'nectar = permanent positive, thorn = permanent negative. REQUIRED for a new trait. ' +
            'Blossoms are excluded — borrowed Godhead power with a KRMA custody chain; they only ' +
            'come from the Godhead bestowal flow, never a sheet edit.',
        ),
        category: z
          .enum(['combat', 'learning', 'magic', 'social', 'utility', 'supernatural', 'supertech', 'natural'])
          .optional()
          .describe('REQUIRED for a new trait.'),
        pillar: z.enum(['body', 'spirit', 'soul']).optional().describe(
          'REQUIRED for a new trait — determines death-engine routing.',
        ),
        description: z.string().max(1000).optional().describe(
          'Bearer-agnostic rule text ("the bearer...", never a specific name). REQUIRED for a new trait.',
        ),
        mechanicalEffect: z.string().max(500).optional(),
      }),
    )
    .max(20)
    .optional()
    .describe('Upserts by trait name (case-insensitive). GM-fiat authoring — reusable traits should go through the Forge for pricing.'),
  removeTraits: z.array(z.string().min(1)).max(20).optional(),
});

export const editCharacterSheetTool: JewlTool = {
  name: 'edit_character_sheet',
  description:
    'Structurally edit a character sheet: rename, set attribute LEVELS ' +
    '(pool maxes — for current-pool-only changes during play prefer ' +
    'set_attribute_current), and add/re-level/remove skills. Targeted ' +
    'operations, campaign-scoped, GM/ADMIN gated, changelogged. Character ' +
    'may be given by name. Use for authoring and GM corrections — e.g. ' +
    'bumping a draft shell to a human baseline, granting a skill after ' +
    'training.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = inputSchema.parse(input);

    const resolved = await resolveCharacterRef(ctx.campaignId, parsed.character);
    if (!resolved) {
      return {
        output: {
          ok: false,
          reason: `No character "${parsed.character}" in this campaign. Use list_canvas_characters or read_actors_state to find the right name/id.`,
        },
      };
    }

    const row = await prisma.character.findUniqueOrThrow({
      where: { id: resolved.id },
      select: { data: true },
    });
    const data = JSON.parse(row.data) as Record<string, unknown>;
    const changes: string[] = [];

    if (parsed.setAttributes?.length) {
      const attrs = (data.attributes ?? {}) as Record<string, GrowthAttribute | GrowthFrequency>;
      for (const op of parsed.setAttributes) {
        const isFrequency = op.attribute === 'frequency';
        const existing = attrs[op.attribute];
        const old: GrowthAttribute = existing
          ? (existing as GrowthAttribute)
          : { level: 0, current: 0, augmentPositive: 0, augmentNegative: 0 };
        const level = op.level ?? old.level;
        const augPos = isFrequency ? 0 : (old.augmentPositive ?? 0);
        const augNeg = isFrequency ? 0 : (old.augmentNegative ?? 0);
        const max = Math.max(0, level + augPos - augNeg);
        const oldMax = Math.max(0, old.level + augPos - augNeg);
        // A full pool follows the new max (authoring case); a spent pool is
        // clamped, never silently refilled.
        let current: number;
        if (op.current != null) current = Math.min(Math.max(0, op.current), max);
        else if (old.current >= oldMax) current = max;
        else current = Math.min(old.current, max);

        attrs[op.attribute] = isFrequency
          ? { ...(existing as GrowthFrequency | undefined), level, current }
          : { ...old, level, current };
        changes.push(`${op.attribute}: level ${old.level}→${level}, current ${old.current}→${current}`);
      }
      data.attributes = attrs;
    }

    if (parsed.setSkills?.length || parsed.removeSkills?.length) {
      let skills = (Array.isArray(data.skills) ? data.skills : []) as GrowthSkill[];
      for (const op of parsed.setSkills ?? []) {
        const idx = skills.findIndex(s => s.name.toLowerCase() === op.name.toLowerCase());
        if (idx >= 0) {
          const before = skills[idx].level;
          skills[idx] = {
            ...skills[idx],
            level: op.level,
            ...(op.governors ? { governors: op.governors } : {}),
            ...(op.description ? { description: op.description } : {}),
          };
          changes.push(`skill ${skills[idx].name}: level ${before}→${op.level}`);
        } else {
          if (!op.governors?.length) {
            return {
              output: {
                ok: false,
                reason: `New skill "${op.name}" needs at least one governor (${SKILL_GOVERNORS.join(', ')}).`,
              },
            };
          }
          skills.push({
            name: op.name,
            level: op.level,
            governors: op.governors,
            ...(op.description ? { description: op.description } : {}),
          });
          changes.push(`skill ${op.name}: added at level ${op.level}`);
        }
      }
      for (const name of parsed.removeSkills ?? []) {
        const before = skills.length;
        skills = skills.filter(s => s.name.toLowerCase() !== name.toLowerCase());
        if (skills.length < before) changes.push(`skill ${name}: removed`);
      }
      data.skills = skills;
    }

    if (parsed.setTraits?.length || parsed.removeTraits?.length) {
      let traits = (Array.isArray(data.traits) ? data.traits : []) as GrowthTrait[];
      for (const op of parsed.setTraits ?? []) {
        const idx = traits.findIndex(t => t.name.toLowerCase() === op.name.toLowerCase());
        if (idx >= 0) {
          if (traits[idx].type === 'blossom') {
            return {
              output: {
                ok: false,
                reason: `"${traits[idx].name}" is a blossom — borrowed Godhead power with a KRMA custody chain. Sheet edits cannot touch blossoms.`,
              },
            };
          }
          traits[idx] = {
            ...traits[idx],
            ...(op.type ? { type: op.type } : {}),
            ...(op.category ? { category: op.category } : {}),
            ...(op.pillar ? { pillar: op.pillar } : {}),
            ...(op.description ? { description: op.description } : {}),
            ...(op.mechanicalEffect ? { mechanicalEffect: op.mechanicalEffect } : {}),
          };
          changes.push(`trait ${traits[idx].name}: updated`);
        } else {
          if (!op.type || !op.category || !op.pillar || !op.description) {
            return {
              output: {
                ok: false,
                reason: `New trait "${op.name}" needs type (nectar|thorn), category, pillar (body|spirit|soul), and bearer-agnostic description.`,
              },
            };
          }
          traits.push({
            name: op.name,
            type: op.type,
            category: op.category,
            pillar: op.pillar,
            description: op.description,
            ...(op.mechanicalEffect ? { mechanicalEffect: op.mechanicalEffect } : {}),
          });
          changes.push(`trait ${op.name}: added (${op.type})`);
        }
      }
      for (const name of parsed.removeTraits ?? []) {
        const hit = traits.find(t => t.name.toLowerCase() === name.toLowerCase());
        if (!hit) continue;
        if (hit.type === 'blossom') {
          return {
            output: {
              ok: false,
              reason: `"${hit.name}" is a blossom — its KRMA must return to the lending Godhead through the expiry/death flow, not a sheet edit.`,
            },
          };
        }
        traits = traits.filter(t => t !== hit);
        changes.push(`trait ${name}: removed`);
      }
      data.traits = traits;
    }

    if (parsed.setName) changes.push(`name: ${resolved.name}→${parsed.setName}`);

    if (changes.length === 0) {
      return { output: { ok: false, reason: 'No operations supplied — nothing to change.' } };
    }

    // The service owns the permission gate + changelog.
    await updateCharacter(resolved.id, ctx.actorId, ctx.actorRole, {
      ...(parsed.setName ? { name: parsed.setName } : {}),
      data,
    });

    return {
      output: { ok: true, characterId: resolved.id, name: parsed.setName ?? resolved.name, changes },
      affected: { characters: [{ id: resolved.id, changes }] },
    };
  },
};

registerJewlTool(editCharacterSheetTool);
