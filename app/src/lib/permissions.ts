// Reusable authorization helpers — eliminates duplicated isGM/isAdmin checks

export function isAdminRole(role: string): boolean {
  return role === 'GODHEAD' || role === 'ADMIN';
}

export function isWatcherOrAbove(role: string): boolean {
  return role === 'WATCHER' || isAdminRole(role);
}

// Contracts (T13) are Terminal-level instruments — ADMIN only (Mike), not
// the GODHEAD app role. Authoring is an unrestricted-variant canvas gesture
// on __PRIME__ (INV-116).
export function canManageContracts(role: string): boolean {
  return role === 'ADMIN';
}

export function canManageCampaign(userId: string, userRole: string, campaign: { gmUserId: string }): boolean {
  return campaign.gmUserId === userId || isAdminRole(userRole);
}

/**
 * Posting a table line as/for a character (2026-10-09): the campaign's GM (or
 * ADMIN/GODHEAD) may post for any character; anyone else only for their own
 * character in this campaign.
 */
export function canPostAsCharacter(
  userId: string,
  userRole: string,
  campaign: { id: string; gmUserId: string },
  character: { userId: string | null; campaignId: string | null },
): boolean {
  if (canManageCampaign(userId, userRole, campaign)) return true;
  return character.userId === userId && character.campaignId === campaign.id;
}

/**
 * Campaign read access (Mike 2026-10-08): the campaign's GM/Watcher, its
 * members (Trailblazers), and ADMIN. Nobody else reads a campaign's feed,
 * changelog or sessions. `isMember` = a CampaignMember row exists.
 */
export function canViewCampaign(
  userId: string,
  userRole: string,
  campaign: { gmUserId: string },
  isMember: boolean,
): boolean {
  return campaign.gmUserId === userId || isMember || isAdminRole(userRole);
}

/**
 * The table feed's truth record (Mike 2026-10-08, ruling-feed-per-viewer): the campaign's own Watcher and
 * ADMIN read every line as it happened. Everyone else — a Trailblazer, another Watcher, a GODHEAD not seated
 * as this campaign's Watcher ("the truth view BY THE SEAT, not by its nature", 2026-10-09) — reads the feed
 * as their character perceived it (when PERCEPTION_FEED is on).
 */
export function seesTruthRecord(userId: string, userRole: string, campaign: { gmUserId: string }): boolean {
  return campaign.gmUserId === userId || userRole === 'ADMIN';
}

/**
 * JEWL history is private per user (Mike 2026-10-08): a viewer sees the rows
 * they wrote and JEWL's replies addressed to them (both carry their userId).
 * Rows with no userId cannot be attributed — only ADMIN sees those.
 */
export function canSeeCopilotRow(
  viewerId: string,
  viewerRole: string,
  row: { userId: string | null },
): boolean {
  if (row.userId === null) return viewerRole === 'ADMIN';
  return row.userId === viewerId;
}

export function canViewCharacter(
  userId: string,
  userRole: string,
  character: { userId: string; campaign?: { gmUserId: string } | null },
): boolean {
  return character.userId === userId || character.campaign?.gmUserId === userId || isAdminRole(userRole);
}

export function canEditCharacter(
  userId: string,
  userRole: string,
  character: { userId: string; campaign?: { gmUserId: string } | null },
): boolean {
  return character.userId === userId || character.campaign?.gmUserId === userId || isAdminRole(userRole);
}
