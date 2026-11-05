import { prisma } from '../app/src/lib/db';
(async () => {
  const rows = await (prisma as any).portraitGeneration.findMany({ orderBy: { createdAt: 'desc' }, take: 3 });
  for (const r of rows) console.log(r.createdAt.toISOString(), r.characterId, r.composition ?? '', '\nPROMPT:', r.prompt, '\nIMG:', r.imagePath ?? r.outputPath ?? '', '\n');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
