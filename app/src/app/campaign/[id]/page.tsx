import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import CampaignCanvas from '@/components/CampaignCanvas';
import { canEnterAdultCampaign } from '@/lib/permissions';
import { REMOVED_STATUS } from '@/services/maturity';
import { loadCanvasCampaign, assembleCanvasModelFor } from '@/services/canvas-model';
import AdultOnlyNotice from '@/components/maturity/AdultOnlyNotice';

export default async function CampaignCanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/');

  const { id } = await params;

  const campaign = await loadCanvasCampaign(id);

  if (!campaign) redirect('/terminal');

  // Allow access if user is admin, GM, or a campaign member
  const isAdmin = session.user.role === 'GODHEAD' || session.user.role === 'ADMIN';
  const isGM = campaign.gmUserId === session.user.id;
  const isMember = campaign.members.some(m => m.userId === session.user.id && !['INTERESTED', 'REJECTED', REMOVED_STATUS].includes(m.status));

  // Adult-only tables (2026-10-12): a minor sees "This table is 18+", never the campaign.
  if (!canEnterAdultCampaign(session.user, campaign)) return <AdultOnlyNotice backHref="/trailblazer" />;

  if (!isAdmin && !isGM && !isMember) redirect('/terminal');

  // No lane wake on open (2026-10-17, cost): warm only while a session is live (daya/l1-keepalive).

  // Trailblazer roster for the canvas card's controller dropdown. Filter out
  // people who haven't joined yet (INTERESTED/REJECTED). The GM is offered
  // separately in the dropdown, so exclude them here.
  const trailblazers = campaign.members
    .filter(m => !['INTERESTED', 'REJECTED'].includes(m.status) && m.userId !== campaign.gmUserId)
    .map(m => ({ userId: m.user.id, username: m.user.username }));

  // Fog of war (2026-10-28): a Trailblazer's first picture is the map as their character last knew it.
  const { nodes, connections, autoFolders, locatedAtEdges, entityNames } = await assembleCanvasModelFor(campaign, session.user);

  const campaignData = {
    id: campaign.id,
    name: campaign.name,
    inviteCode: campaign.inviteCode,
    genre: campaign.genre,
    canvasLayoutEpoch: campaign.canvasLayoutEpoch,
  };

  // Find the current user's character for terminal auto-detection
  const myChar = campaign.characters.find(c => c.userId === session.user.id);
  const userCharacterInfo = myChar ? {
    id: myChar.id,
    name: myChar.name,
    data: myChar.data,
  } : null;

  return (
    <CampaignCanvas
      campaign={campaignData}
      nodes={nodes}
      connections={connections}
      autoFolders={autoFolders}
      locatedAtEdges={locatedAtEdges}
      entityNames={entityNames}
      userId={session.user.id}
      username={session.user.username}
      userRole={session.user.role}
      userCharacter={userCharacterInfo}
      trailblazers={trailblazers}
    />
  );
}
