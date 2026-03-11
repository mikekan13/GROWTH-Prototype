import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import CampaignCanvas from '@/components/CampaignCanvas';
import { recomputeAugments } from '@/lib/character-actions';

export default async function CampaignCanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/');

  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      characters: {
        select: {
          id: true,
          name: true,
          status: true,
          data: true,
          portrait: true,
          userId: true,
        },
      },
      members: {
        include: {
          user: { select: { id: true } },
        },
      },
      locations: {
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          data: true,
        },
      },
      campaignItems: {
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          data: true,
          holderId: true,
          locationId: true,
        },
      },
    },
  });

  if (!campaign) redirect('/terminal');

  // Allow access if user is admin, GM, or a campaign member
  const isAdmin = session.user.role === 'GODHEAD' || session.user.role === 'ADMIN';
  const isGM = campaign.gmUserId === session.user.id;
  const isMember = campaign.members.some(m => m.userId === session.user.id);

  if (!isAdmin && !isGM && !isMember) redirect('/terminal');

  // Build name lookups for item holder/location references
  const charNameMap = new Map(campaign.characters.map(c => [c.id, c.name]));
  const locNameMap = new Map(campaign.locations.map(l => [l.id, l.name]));

  // Transform characters to CanvasNode format with full data
  const characterNodes = campaign.characters.map((char, index) => {
    let charData = null;
    try {
      const parsed = JSON.parse(char.data);
      // Recompute augments from equipped items + traits on load
      const { character: augmented } = recomputeAugments(parsed);
      charData = augmented as unknown as Record<string, unknown>;
    } catch { /* use null */ }

    return {
      id: char.id,
      type: 'character' as const,
      name: char.name,
      x: 200 + index * 300,
      y: -200 - index * 80,
      status: char.status,
      portrait: char.portrait,
      characterData: charData,
    };
  });

  // Transform locations to CanvasNode format
  const locationNodes = campaign.locations.map((loc, index) => {
    let locData = null;
    try {
      locData = JSON.parse(loc.data);
    } catch { /* use null */ }

    return {
      id: loc.id,
      type: 'location' as const,
      name: loc.name,
      x: -400 + index * 350,
      y: 200 + index * 100,
      status: loc.status,
      locationType: loc.type,
      locationData: locData,
    };
  });

  // Transform items to CanvasNode format
  const itemNodes = campaign.campaignItems.map((item, index) => {
    let itemData = null;
    try {
      itemData = JSON.parse(item.data);
    } catch { /* use null */ }

    return {
      id: item.id,
      type: 'item' as const,
      name: item.name,
      x: 600 + index * 280,
      y: 300 + index * 80,
      status: item.status,
      itemType: item.type,
      itemData: itemData,
      holderId: item.holderId || null,
      holderName: item.holderId ? charNameMap.get(item.holderId) : undefined,
      locationName: item.locationId ? locNameMap.get(item.locationId) : undefined,
    };
  });

  const nodes = [...characterNodes, ...locationNodes, ...itemNodes];

  const campaignData = {
    id: campaign.id,
    name: campaign.name,
    inviteCode: campaign.inviteCode,
    genre: campaign.genre,
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
      connections={[]}
      userId={session.user.id}
      username={session.user.username}
      userRole={session.user.role}
      userCharacter={userCharacterInfo}
    />
  );
}
