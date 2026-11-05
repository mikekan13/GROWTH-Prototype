import { prisma } from '../app/src/lib/db';
const K = process.argv[2] ?? 'cmvcbw49u0001h448qanzbhs3';
const A = ['clout','celerity','constitution','flow','frequency','focus','willpower','wisdom','wit'];
(async () => {
  const links = await prisma.characterBlockLink.findMany({ where: { characterId: K } });
  const items = await prisma.forgeItem.findMany({ where: { id: { in: links.map(l => l.forgeItemId) } } });
  const sum: Record<string, number> = {};
  for (const i of items) { if (!['seed','root','branch'].includes(i.type)) continue; const d = JSON.parse(i.data); const a = d.attributes ?? d.baseAttributes ?? {};
    console.log(i.type.padEnd(6), i.name.padEnd(40), A.map(k => `${k.slice(0,3)}:${a[k] ?? 0}`).join(' '));
    for (const k of A) sum[k] = (sum[k] ?? 0) + (Number(a[k]) || 0); }
  console.log('SUM'.padEnd(47), A.map(k => `${k.slice(0,3)}:${sum[k]}`).join(' '));
  const sh = JSON.parse((await prisma.character.findUniqueOrThrow({ where: { id: K } })).data).attributes;
  console.log('SHEET'.padEnd(47), A.map(k => `${k.slice(0,3)}:${sh[k]?.level ?? sh[k]?.current ?? '?'}`).join(' '));
  process.exit(0);
})();
