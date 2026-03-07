// Reusable authorization helpers — eliminates duplicated isGM/isAdmin checks

export function isAdminRole(role: string): boolean {
  return role === 'GODHEAD' || role === 'ADMIN';
}

export function isWatcherOrAbove(role: string): boolean {
  return role === 'WATCHER' || isAdminRole(role);
}

export function canManageCampaign(userId: string, userRole: string, campaign: { gmUserId: string }): boolean {
  return campaign.gmUserId === userId || isAdminRole(userRole);
}

export function canViewCharacter(
  userId: string,
  userRole: string,
  character: { userId: string; campaign: { gmUserId: string } },
): boolean {
  return character.userId === userId || character.campaign.gmUserId === userId || isAdminRole(userRole);
}

export function canEditCharacter(
  userId: string,
  userRole: string,
  character: { campaign: { gmUserId: string } },
): boolean {
  return character.campaign.gmUserId === userId || isAdminRole(userRole);
}
