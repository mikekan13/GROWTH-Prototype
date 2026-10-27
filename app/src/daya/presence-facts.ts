/**
 * WHO IS IN SIGHT, STATED EVERY BEAT (HW8 run 7 #5, #9). Kristopher stood on the landing with the door closed and his voice wrote "the
 * sight of her anchors me" after the GM said only that he remembers her. The facts say it plainly instead: who is in the room, that no
 * one is in sight, that the door between is shut, and how well the being knows the people it can place (F-level of identity and
 * appearance). A GM line that makes him REMEMBER someone is memory, not presence. Pure.
 */
export interface OtherPlace { id: string; name: string; roomName: string | null; route: Array<{ kind: string; state?: string; name: string }> | null }

export function presenceFacts(roomName: string, others: OtherPlace[]): { lines: string[]; noOneInView: boolean; absentNames: string[] } {
  const here = others.filter((o) => o.route && o.route.length === 0);
  const away = others.filter((o) => !(o.route && o.route.length === 0));
  const sealedAll = away.every((o) => !o.route || o.route.some((e) => e.kind === 'door' && e.state !== 'open'));
  const noOneInView = here.length === 0 && sealedAll;
  const lines: string[] = [];
  if (here.length) lines.push(`In the room with you: ${here.map((o) => o.name).join(', ')}.`);
  else if (noOneInView) lines.push(`No one is in sight. You are alone in the ${roomName}; anyone you remember or think of is not in front of you.`);
  for (const o of away) {
    const door = o.route?.find((e) => e.kind === 'door' && e.state !== 'open');
    if (door) lines.push(`${o.name} is not in sight - the ${door.name.replace(/_/g, ' ')} between you is ${door.state ?? 'closed'}.`);
  }
  return { lines, noOneInView, absentNames: away.map((o) => o.name.split(/\s+/)[0]).filter(Boolean) };
}

const levelOf = (score: number): number => (score >= 0.97 ? 5 : Math.max(0, Math.min(4, Math.floor(score * 5))));

/** "You know Kristopher: identity F3, appearance F3." - null when the being knows nothing of them. */
export function knowsLine(name: string, identityScore: number, appearanceScore: number): string | null {
  const a = levelOf(identityScore);
  const b = levelOf(appearanceScore);
  if (a === 0 && b === 0) return null;
  return `You know ${a >= 2 ? name : 'this person'}: identity F${a}, appearance F${b}${a >= 3 ? ' - they are not a stranger to you' : ''}.`;
}
