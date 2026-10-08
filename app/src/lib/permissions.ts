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
