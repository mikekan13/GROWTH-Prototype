import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import CampaignCanvas from '@/components/CampaignCanvas';

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
    },
  });

  if (!campaign) redirect('/terminal');

  // Allow access if user is admin, GM, or a campaign member
  const isAdmin = session.user.role === 'GODHEAD' || session.user.role === 'ADMIN';
  const isGM = campaign.gmUserId === session.user.id;
  const isMember = campaign.members.some(m => m.userId === session.user.id);

  if (!isAdmin && !isGM && !isMember) redirect('/terminal');

  // Transform characters to CanvasNode format with full data
  const nodes = campaign.characters.map((char, index) => {
    let charData = null;
    try {
      charData = JSON.parse(char.data);
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
