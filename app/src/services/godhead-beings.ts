/**
 * Godheads as beings (Mike 2026-09-22/23, MEMORY-DESIGN §5).
 *
 * A Godhead is the same DAYA mechanism as a character with a godlike sheet:
 * a DayaEntity whose recall runs with a threshold of zero and a budget of
 * everything, unfoolable except on purpose. The custodian tree (parentId) is
 * the seating structure; which seat holds which of the ten domains is Mike's
 * to rule (domainKey blank until then).
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { isAdminRole } from '@/lib/permissions';

export interface GodheadBeing { godheadId: string; name: string; entityId: string; created: boolean }

/** Make sure every GodHead row has an ACTIVE DayaEntity with a godlike persona flag. ADMIN. */
export async function ensureGodheadEntities(actorRole: string): Promise<GodheadBeing[]> {
  if (!isAdminRole(actorRole)) throw new ForbiddenError('Admin only');
  const godheads = await prisma.godHead.findMany({ select: { id: true, name: true, domain: true, pillar: true, characterId: true, systemPrompt: true } });
  const out: GodheadBeing[] = [];
  for (const gh of godheads) {
    const existing = await prisma.dayaEntity.findUnique({ where: { characterId: gh.characterId }, select: { id: true, personaProfile: true, status: true } });
    let persona: Record<string, unknown> = {};
    try { persona = existing ? (JSON.parse(existing.personaProfile) as Record<string, unknown>) : {}; } catch { persona = {}; }
    const nextPersona = {
      ...persona,
      godlike: true,
      identityNarrative: (persona.identityNarrative as string | undefined) ?? `${gh.name}, a Godhead of ${gh.pillar.toLowerCase()} — ${gh.domain}.`,
      voiceNotes: (persona.voiceNotes as string | undefined) ?? gh.systemPrompt.slice(0, 600),
    };
    if (existing) {
      await prisma.dayaEntity.update({ where: { id: existing.id }, data: { personaProfile: JSON.stringify(nextPersona), status: 'ACTIVE', introspection: 0.98 } });
      out.push({ godheadId: gh.id, name: gh.name, entityId: existing.id, created: false });
    } else {
      const row = await prisma.dayaEntity.create({ data: { characterId: gh.characterId, personaProfile: JSON.stringify(nextPersona), status: 'ACTIVE', introspection: 0.98 } });
      out.push({ godheadId: gh.id, name: gh.name, entityId: row.id, created: true });
    }
  }
  return out;
}

/** Seat a Godhead under a parent (the custodian tree) and/or at a domain. ADMIN. */
export async function seatGodhead(actorRole: string, input: { godheadId: string; parentId?: string | null; domainKey?: string | null }) {
  if (!isAdminRole(actorRole)) throw new ForbiddenError('Admin only');
  const gh = await prisma.godHead.findUnique({ where: { id: input.godheadId } });
  if (!gh) throw new NotFoundError('GodHead not found');
  if (input.parentId) {
    const parent = await prisma.godHead.findUnique({ where: { id: input.parentId }, select: { id: true } });
    if (!parent) throw new NotFoundError('Parent GodHead not found');
    if (parent.id === gh.id) throw new ForbiddenError('A Godhead cannot sit under itself');
  }
  return prisma.godHead.update({
    where: { id: gh.id },
    data: {
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.domainKey !== undefined ? { domainKey: input.domainKey } : {}),
    },
    select: { id: true, name: true, pillar: true, domain: true, parentId: true, domainKey: true },
  });
}

/** The custodian tree as the Watcher sees it. */
export async function godheadTree() {
  const rows = await prisma.godHead.findMany({ select: { id: true, name: true, pillar: true, domain: true, parentId: true, domainKey: true, characterId: true } });
  const entities = await prisma.dayaEntity.findMany({ where: { characterId: { in: rows.map(r => r.characterId) } }, select: { characterId: true, id: true, status: true } });
  const byChar = new Map(entities.map(e => [e.characterId, e]));
  const nodes = rows.map(r => ({ ...r, entity: byChar.get(r.characterId) ?? null, children: [] as string[] }));
  const byId = new Map(nodes.map(n => [n.id, n]));
  for (const n of nodes) if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId)!.children.push(n.id);
  return { roots: nodes.filter(n => !n.parentId).map(n => n.id), nodes };
}
