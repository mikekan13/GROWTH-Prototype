import { prisma } from '../app/src/lib/db';

async function main() {
  const evs = await prisma.campaignEvent.findMany({ where: { createdAt: { gte: new Date('2026-10-25T09:22:00Z') } }, orderBy: { createdAt: 'asc' }, select: { type: true, actor: true, characterName: true, payload: true, createdAt: true } });
  let decl = 0;
  for (const e of evs) {
    const p = JSON.parse(e.payload) as Record<string, unknown>;
    const kind = (p.eventType ?? p.kind ?? e.type) as string;
    if (kind === 'declaration') { decl++; if (decl > 1) break; }
    const text = (p.message ?? p.description ?? p.thought ?? p.text ?? p.narration ?? '') as string;
    console.log(`${e.createdAt.toISOString().slice(11, 19)} ${e.type}/${kind} ${e.actor} ${e.characterName ?? ''}`);
    if (text) console.log('    ' + String(text).replace(/\s+/g, ' ').slice(0, 700));
    const keys = Object.keys(p).filter((k) => !['message', 'description', 'thought', 'text', 'narration', 'eventType', 'kind'].includes(k));
    if (keys.length) console.log('    keys: ' + keys.join(','));
  }
}
main().finally(() => prisma.$disconnect());
