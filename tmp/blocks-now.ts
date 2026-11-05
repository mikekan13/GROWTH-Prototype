import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any;
  for (const [name, id] of [['Violet', 'cms60ndtn0000kw48ioq10i68'], ['Kristopher', 'cmvcbw49u0001h448qanzbhs3']]) {
    const links: any[] = await p.$queryRawUnsafe(`SELECT * FROM CharacterBlockLink WHERE characterId = ?`, id);
    console.log(`## ${name}: ${links.length} links; link columns: ${Object.keys(links[0] ?? {}).join(',')}`);
    for (const l of links) {
      const fid = l.forgeItemId ?? l.blockId ?? l.itemId;
      const items: any[] = fid ? await p.$queryRawUnsafe(`SELECT * FROM ForgeItem WHERE id = ?`, fid) : [];
      const it = items[0];
      if (!it) { console.log('  link', JSON.stringify(l).slice(0, 200)); continue; }
      const short: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(it)) if (k !== "data" && k !== "description" && k !== "lore" && typeof v !== "object") short[k] = typeof v === "bigint" ? Number(v) : v;
      console.log('  *', JSON.stringify(short));
      let data: any = {}; try { data = JSON.parse(it.data ?? '{}'); } catch {}
      const attrKeys = Object.keys(data).filter((k) => /attr|aug|base|level|stat/i.test(k));
      for (const k of attrKeys) console.log('     ', k, JSON.stringify(data[k]).slice(0, 300));
      if (!attrKeys.length) console.log('      data keys:', Object.keys(data).join(','));
    }
  }
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
