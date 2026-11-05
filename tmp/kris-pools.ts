import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
(async () => {
  for (const id of ['cmvcbw49u0001h448qanzbhs3', 'cms60ndtn0000kw48ioq10i68']) {
    const c = await prisma.character.findUniqueOrThrow({ where: { id }, select: { name: true, data: true } });
    const d = JSON.parse(c.data ?? '{}');
    console.log(`== ${c.name} == tkv=${JSON.stringify(d.tkv)} seed=${d.creation?.seedName ?? d.creation?.seed ?? '?'} seedKV=${d.creation?.seedKV ?? '?'} fatedAge=${d.fatedAge} wealth=${JSON.stringify(d.wealth)}`);
    for (const [k, v] of Object.entries(d.attributes ?? {})) { const a: any = v; console.log(`  ${k.padEnd(13)} level=${a.level} cur=${a.current} +${a.augmentPositive ?? 0} -${a.augmentNegative ?? 0}`); }
    console.log('  skills:', (d.skills ?? []).map((s: any) => `${s.name}:${s.tier ?? s.die ?? ''}`).join(', '));
    console.log('  traits:', (d.traits ?? []).map((t: any) => `${t.type}:${t.name}${t.kv != null ? `(kv ${t.kv})` : ''}${t.lienKV != null ? `(lien ${t.lienKV})` : ''}`).join(' | '));
  }
  process.exit(0);
})();
