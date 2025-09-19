// Check existing player invitations
const { PrismaClient } = require('@prisma/client');

async function checkInvitations() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Checking existing player invitations...');

    const invitations = await prisma.playerInvitation.findMany({
      where: { playerEmail: 'KyleenKantack@gmail.com' },
      include: {
        gm: {
          include: { user: true }
        }
      }
    });

    console.log(`Found ${invitations.length} invitation(s) for KyleenKantack@gmail.com:`);

    invitations.forEach((invitation, index) => {
      console.log(`\n${index + 1}. Invitation ID: ${invitation.id}`);
      console.log(`   Status: ${invitation.status}`);
      console.log(`   GM: ${invitation.gm.user.name} (${invitation.gm.user.email})`);
      console.log(`   Invite Token: ${invitation.inviteToken}`);
      console.log(`   Created: ${invitation.createdAt}`);
      console.log(`   Expires: ${invitation.expiresAt}`);
      console.log(`   Valid: ${invitation.status === 'PENDING' && invitation.expiresAt > new Date()}`);

      if (invitation.status === 'PENDING' && invitation.expiresAt > new Date()) {
        console.log(`   🌐 Active Invitation URL: http://localhost:3000/invite?token=${invitation.inviteToken}`);
      }
    });

    // Also check for any existing player profiles
    const players = await prisma.playerProfile.findMany({
      where: {
        user: { email: 'KyleenKantack@gmail.com' }
      },
      include: { user: true, gm: { include: { user: true } } }
    });

    if (players.length > 0) {
      console.log(`\nFound ${players.length} player profile(s):`);
      players.forEach((player, index) => {
        console.log(`\n${index + 1}. Player: ${player.user.email}`);
        console.log(`   GM: ${player.gm.user.name} (${player.gm.user.email})`);
        console.log(`   Active: ${player.isActive}`);
        console.log(`   Joined: ${player.joinedAt}`);
      });
    } else {
      console.log('\nNo existing player profiles found for KyleenKantack@gmail.com');
    }

  } catch (error) {
    console.error('❌ Error checking invitations:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkInvitations();