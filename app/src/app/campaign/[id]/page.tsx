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
          godHead: { select: { aiActionMode: true } },
        },
      },
      members: { include: { user: { select: { id: true, username: true } } } },
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
  const isMember = campaign.members.some(m => m.userId === session.user.id && !['INTERESTED', 'REJECTED'].includes(m.status));

  if (!isAdmin && !isGM && !isMember) redirect('/terminal');

  // Trailblazer roster for the canvas card's controller dropdown. Filter out
  // people who haven't joined yet (INTERESTED/REJECTED). The GM is offered
  // separately in the dropdown, so exclude them here.
  const trailblazers = campaign.members
    .filter(m => !['INTERESTED', 'REJECTED'].includes(m.status) && m.userId !== campaign.gmUserId)
    .map(m => ({ userId: m.user.id, username: m.user.username }));

  // Build name lookups for item holder/location references
  const charNameMap = new Map(campaign.characters.map(c => [c.id, c.name]));
  const locNameMap = new Map(campaign.locations.map(l => [l.id, l.name]));

  // A character belongs on the canvas when either:
  //  (a) status is APPROVED or ACTIVE — these auto-place into the world on lock-in,
  //  (b) the GM has explicitly placed it via the Tools→Character picker (canvasX/Y set).
  // DRAFT/SUBMITTED-without-position stay in the Tapestry tab (entities API) until placed.
  const canvasCharacters = campaign.characters.filter(c => {
    if (c.status === 'APPROVED' || c.status === 'ACTIVE') return true;
    try {
      const d = JSON.parse(c.data);
      return typeof d?.canvasX === 'number' && typeof d?.canvasY === 'number';
    } catch { return false; }
  });

  // Transform characters to CanvasNode format with full data
  const characterNodes = canvasCharacters.map((char, index) => {
    let charData: (Record<string, unknown> & { canvasX?: number; canvasY?: number }) | null = null;
    try {
      const parsed = JSON.parse(char.data);
      // Recompute augments from equipped items + traits on load
      const { character: augmented } = recomputeAugments(parsed);
      charData = augmented as unknown as Record<string, unknown> & { canvasX?: number; canvasY?: number };
    } catch { /* use null */ }

    // Prefer GM-placed canvas position; fall back to a deterministic auto-layout.
    const storedX = typeof charData?.canvasX === 'number' ? charData.canvasX : undefined;
    const storedY = typeof charData?.canvasY === 'number' ? charData.canvasY : undefined;

    return {
      id: char.id,
      type: 'character' as const,
      name: char.name,
      x: storedX ?? (200 + index * 300),
      y: storedY ?? (-200 - index * 80),
      status: char.status,
      portrait: char.portrait,
      characterData: charData,
      hasAIPersona: char.godHead !== null,
      aiActionMode: char.godHead?.aiActionMode ?? false,
      controllerUserId: char.userId,
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

    const storedX = typeof itemData?.x === 'number' ? itemData.x : null;
    const storedY = typeof itemData?.y === 'number' ? itemData.y : null;

    return {
      id: item.id,
      type: 'item' as const,
      name: item.name,
      x: storedX ?? 600 + index * 280,
      y: storedY ?? 300 + index * 80,
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
      trailblazers={trailblazers}
    />
  );
}
