/**
 * Remove all example/seed users and campaigns EXCEPT Mikekan13 and The Prime Campaign.
 * Also preserves system wallets (RESERVE, BURN, LADY_DEATH) and KRMA ledger data.
 *
 * Usage: npx tsx scripts/cleanup-examples.ts
 */
import { prisma } from '../src/lib/db';

async function main() {
  console.log('=== Cleaning up example data ===\n');

  // Find the user and campaign to keep
  const keeper = await prisma.user.findUnique({ where: { username: 'Mikekan13' } });
  if (!keeper) {
    console.error('Mikekan13 not found! Aborting.');
    process.exit(1);
  }
  console.log(`Keeping user: ${keeper.username} (${keeper.id})`);

  const primeCampaign = await prisma.campaign.findFirst({ where: { name: 'The Prime Campaign' } });
  if (primeCampaign) {
    console.log(`Keeping campaign: ${primeCampaign.name} (${primeCampaign.id})`);
  }

  const keepUserIds = [keeper.id];
  const keepCampaignIds = primeCampaign ? [primeCampaign.id] : [];

  // Get IDs of campaigns to delete
  const campaignsToDelete = await prisma.campaign.findMany({
    where: { id: { notIn: keepCampaignIds } },
    select: { id: true, name: true },
  });
  const deleteCampaignIds = campaignsToDelete.map(c => c.id);

  // Get IDs of users to delete
  const usersToDelete = await prisma.user.findMany({
    where: { id: { notIn: keepUserIds } },
    select: { id: true, username: true },
  });
  const deleteUserIds = usersToDelete.map(u => u.id);

  console.log(`\nWill delete ${usersToDelete.length} users and ${campaignsToDelete.length} campaigns.\n`);

  if (deleteCampaignIds.length > 0) {
    // 1. Campaign children (order matters — no cascade)
    const apps = await prisma.campaignApplication.deleteMany({ where: { campaignId: { in: deleteCampaignIds } } });
    console.log(`  Deleted ${apps.count} campaign applications`);

    const members = await prisma.campaignMember.deleteMany({ where: { campaignId: { in: deleteCampaignIds } } });
    console.log(`  Deleted ${members.count} campaign members`);

    const backstories = await prisma.characterBackstory.deleteMany({
      where: { character: { campaignId: { in: deleteCampaignIds } } },
    });
    console.log(`  Deleted ${backstories.count} character backstories`);

    const changeLogs = await prisma.changeLog.deleteMany({ where: { campaignId: { in: deleteCampaignIds } } });
    console.log(`  Deleted ${changeLogs.count} change logs`);

    const chars = await prisma.character.deleteMany({ where: { campaignId: { in: deleteCampaignIds } } });
    console.log(`  Deleted ${chars.count} characters`);

    const copilot = await prisma.copilotMessage.deleteMany({ where: { campaignId: { in: deleteCampaignIds } } });
    console.log(`  Deleted ${copilot.count} copilot messages`);

    const events = await prisma.campaignEvent.deleteMany({ where: { campaignId: { in: deleteCampaignIds } } });
    console.log(`  Deleted ${events.count} campaign events`);

    const gameSessions = await prisma.gameSession.deleteMany({ where: { campaignId: { in: deleteCampaignIds } } });
    console.log(`  Deleted ${gameSessions.count} game sessions`);

    const requests = await prisma.playerRequest.deleteMany({ where: { campaignId: { in: deleteCampaignIds } } });
    console.log(`  Deleted ${requests.count} player requests`);

    const forgeItems = await prisma.forgeItem.deleteMany({ where: { campaignId: { in: deleteCampaignIds } } });
    console.log(`  Deleted ${forgeItems.count} forge items`);

    const locations = await prisma.location.deleteMany({ where: { campaignId: { in: deleteCampaignIds } } });
    console.log(`  Deleted ${locations.count} locations`);

    const campItems = await prisma.campaignItem.deleteMany({ where: { campaignId: { in: deleteCampaignIds } } });
    console.log(`  Deleted ${campItems.count} campaign items`);

    // Campaign wallets
    const campWallets = await prisma.wallet.deleteMany({ where: { campaignId: { in: deleteCampaignIds } } });
    console.log(`  Deleted ${campWallets.count} campaign wallets`);

    // Delete campaigns
    const camps = await prisma.campaign.deleteMany({ where: { id: { in: deleteCampaignIds } } });
    console.log(`  Deleted ${camps.count} campaigns`);
  }

  // Also clean up any members/applications in the Prime Campaign that belong to deleted users
  if (primeCampaign && deleteUserIds.length > 0) {
    const primeApps = await prisma.campaignApplication.deleteMany({
      where: { campaignId: primeCampaign.id, member: { userId: { in: deleteUserIds } } },
    });
    const primeMembers = await prisma.campaignMember.deleteMany({
      where: { campaignId: primeCampaign.id, userId: { in: deleteUserIds } },
    });
    if (primeApps.count || primeMembers.count) {
      console.log(`  Cleaned ${primeMembers.count} orphan members and ${primeApps.count} apps from Prime Campaign`);
    }
  }

  if (deleteUserIds.length > 0) {
    // User children
    const sessions = await prisma.session.deleteMany({ where: { userId: { in: deleteUserIds } } });
    console.log(`  Deleted ${sessions.count} sessions`);

    const codes = await prisma.accessCode.deleteMany({ where: { redeemedById: { in: deleteUserIds } } });
    console.log(`  Deleted ${codes.count} access codes`);

    // User wallets (not system wallets)
    const userWallets = await prisma.wallet.deleteMany({
      where: { ownerId: { in: deleteUserIds } },
    });
    console.log(`  Deleted ${userWallets.count} user wallets`);

    // Delete users
    const users = await prisma.user.deleteMany({ where: { id: { in: deleteUserIds } } });
    console.log(`  Deleted ${users.count} users`);
  }

  // Final counts
  const remainingUsers = await prisma.user.count();
  const remainingCampaigns = await prisma.campaign.count();
  console.log(`\n=== Done ===`);
  console.log(`Remaining: ${remainingUsers} user(s), ${remainingCampaigns} campaign(s)`);
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
