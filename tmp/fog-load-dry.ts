import { prisma } from '@/lib/db';
import { loadWorldLevel, beingStanding } from '@/services/spatial-world';
import { lookAround } from '@/services/spatial-perception';
import { loadCanvasCampaign, assembleCanvasModel, assembleCanvasModelFor } from '@/services/canvas-model';
import { perceptionFeedOn } from '@/lib/perception-feed';
async function main() {
  const camp = await prisma.campaign.findFirst({ where: { name: { contains: 'Incubator' } }, select: { id: true } });
  const { map } = await loadWorldLevel(camp!.id);
  const chars = await prisma.character.findMany({ where: { campaignId: camp!.id, name: { in: ['Violet', 'Kristopher'] } }, select: { id: true, name: true, userId: true, user: { select: { role: true } } } });
  console.log('perceptionFeedOn', perceptionFeedOn());
  for (const c of chars) { const s = await beingStanding(map, c.id); if (s) await lookAround(camp!.id, c.id, map, s.point); }
  const rows = await prisma.lastKnown.findMany({ where: { campaignId: camp!.id } });
  const names = Object.fromEntries(chars.map(c => [c.id, c.name]));
  for (const r of rows) console.log('LK', names[r.viewerId] ?? r.viewerId, '->', names[r.subjectId] ?? r.subjectId, r.kind, r.known, r.x, r.y, r.roomId?.slice(-4), r.state);
  const campaign = (await loadCanvasCampaign(camp!.id))!;
  const truth = await assembleCanvasModel(campaign);
  const kris = chars.find(c => c.name === 'Kristopher')!;
  const fog = await assembleCanvasModelFor(campaign, { id: kris.userId, role: kris.user.role });
  console.log('truth tokens', truth.nodes.filter(n => n.type !== 'location').map(n => `${n.name}@${n.x},${n.y}`).join(' | '));
  console.log('kris sees  ', fog.nodes.filter(n => n.type !== 'location').map(n => `${n.name}@${n.x},${n.y}${n.unseen ? '(grey)' : ''}`).join(' | '));
  const doors = (m: typeof truth) => m.autoFolders.flatMap(f => (f.locationInfo?.openings ?? []).filter(o => o.state).map(o => `${o.id}:${o.state}`)).join(' ');
  console.log('doors truth', doors(truth)); console.log('doors kris ', doors(fog));
  console.log('kris role', kris.user.role, 'userId', kris.userId);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
