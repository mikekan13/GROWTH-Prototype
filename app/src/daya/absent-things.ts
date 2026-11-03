/**
 * Things the ledger puts out of a being's reach (2026-11-03, session 2: "The bill is still by the door" while Kristopher held it, elsewhere).
 * Usage: pass every CampaignItem of the campaign as { name, holderId, locationId } and me = { characterId, locationId, roomMates }
 * (roomMates = character ids in the being's room). Hand the result to filterVoice as `absentThings`. Pure.
 */
export interface LedgerItem { name: string; holderId: string | null; locationId: string | null }
export interface AbsentMe { characterId: string; locationId: string | null; roomMates: string[] }

export function absentThingsFor(items: LedgerItem[], me: AbsentMe): Array<{ name: string; where: string }> {
  const out: Array<{ name: string; where: string }> = [];
  for (const it of items) {
    if (it.holderId) {
      if (it.holderId === me.characterId || me.roomMates.includes(it.holderId)) continue;
      out.push({ name: it.name, where: 'with someone else' });
    } else if (it.locationId && it.locationId !== me.locationId) {
      out.push({ name: it.name, where: 'elsewhere' });
    }
  }
  return out;
}
