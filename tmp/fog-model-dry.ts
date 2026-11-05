import { prisma } from '@/lib/db';
import { loadCanvasCampaign, assembleCanvasModel } from '@/services/canvas-model';
import { fogCanvasModel, lastKnownFor } from '@/services/last-known';
async function main() {
  const camp = await prisma.campaign.findFirst({ where: { name: { contains: 'Incubator' } }, select: { id: true } });
  const kris = (await prisma.character.findFirst({ where: { campaignId: camp!.id, name: 'Kristopher' }, select: { id: true } }))!;
  const violet = (await prisma.character.findFirst({ where: { campaignId: camp!.id, name: 'Violet' }, select: { id: true } }))!;
  const campaign = (await loadCanvasCampaign(camp!.id))!;
  const truth = await assembleCanvasModel(campaign);
  const show = (label: string, m: typeof truth) => {
    console.log(label, 'tokens', m.nodes.filter(n => n.type !== 'location').length, '::', m.nodes.filter(n => n.type !== 'location' && !n.holderId).map(n => `${n.name}@${n.x},${n.y}${n.unseen ? '(grey)' : ''}`).join(' | '));
    console.log(label, 'doors', m.autoFolders.flatMap(f => (f.locationInfo?.openings ?? []).filter(o => o.state).map(o => `${o.id}:${o.state}`)).join(' '), 'edges', m.locatedAtEdges.length, 'folders', m.autoFolders.map(f => `${f.name}[${f.nodeIds.length}]`).join(' '));
  };
  show('TRUTH', truth);
  show('KRIS ', fogCanvasModel(truth, kris.id, await lastKnownFor(camp!.id, kris.id)));
  show('VIOLET', fogCanvasModel(truth, violet.id, await lastKnownFor(camp!.id, violet.id)));
  show('NOBODY', fogCanvasModel(truth, 'nobody', []));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
