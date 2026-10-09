import { describe, it, expect } from 'vitest';
import { senseProfileFromSheet, mindSensesOf } from './field';
import { validateForgeData } from '@/services/forge-schemas';

// SENSE GRANTS (Mike 2026-10-09): "could be an organ an item a spell... just about anything".
describe('senseProfileFromSheet — sense grants from anything active on the being', () => {
  it('a plain being has no grants and no mind sense', () => {
    const p = senseProfileFromSheet(null);
    expect(p.grants).toEqual([]);
    expect(mindSensesOf(p)).toEqual([]);
  });

  it('an organ (body part) can grant a mind sense, scaled by its condition', () => {
    const p = senseProfileFromSheet({ bodyAnatomy: { partName: 'Body', contains: [{ partName: 'Third Eye', condition: 1, grantsSenses: [{ sense: 'mind', name: 'inner sight' }] }] } });
    expect(mindSensesOf(p)).toEqual([{ name: 'inner sight', effectiveness: 0.5 }]); // Broken halves it
    expect(p.grants[0].source).toMatchObject({ kind: 'organ', label: 'Third Eye' });
  });

  it('a held item and its abilities grant senses; a Destroyed item grants nothing; a loose body part grants nothing', () => {
    const p = senseProfileFromSheet(null, { items: [
      { id: 'c', name: 'Circlet', data: JSON.stringify({ itemAbilities: [{ name: 'Thoughtcatch', grantsSenses: [{ sense: 'mind', effectiveness: 0.7 }] }] }) },
      { id: 'o', name: 'Cracked Orb', data: { condition: 0, grantsSenses: [{ sense: 'mind' }] } },
      { id: 'e', name: 'Severed Eye', data: { isBodyPart: true, grantsSenses: [{ sense: 'mind' }] } },
    ] });
    expect(mindSensesOf(p)).toEqual([{ name: 'Thoughtcatch', effectiveness: 0.7 }]);
    expect(p.grants.find((g) => g.name === 'Thoughtcatch')?.source).toMatchObject({ kind: 'ability', id: 'c' });
  });

  it('traits grant senses; a blossom past its expiry does not', () => {
    const sheet = { traits: [
      { name: 'Mind Reading', type: 'blossom', expiresAtCycle: 5, grantsSenses: [{ sense: 'mind' }] },
      { name: 'Empath', type: 'nectar', grantsSenses: [{ sense: 'mind', effectiveness: 0.3 }] },
    ] };
    expect(mindSensesOf(senseProfileFromSheet(sheet, { nowCycle: 4 })).map((m) => m.name).sort()).toEqual(['Empath', 'Mind Reading']);
    expect(mindSensesOf(senseProfileFromSheet(sheet, { nowCycle: 5 })).map((m) => m.name)).toEqual(['Empath']);
  });

  it('an organ-kind grant counts like an organ: the best source wins', () => {
    const blind = { bodyAnatomy: { partName: 'Body', contains: [{ partName: 'Eyes', condition: 0 }] } };
    expect(senseProfileFromSheet(blind).effectiveness.sight).toBe(0);
    const seeing = senseProfileFromSheet(blind, { items: [{ id: 'g', name: 'Seeing Glass', data: { grantsSenses: [{ sense: 'sight', effectiveness: 0.6 }] } }] });
    expect(seeing.effectiveness.sight).toBe(0.6);
  });

  it('malformed grants are ignored; effectiveness is clamped', () => {
    const p = senseProfileFromSheet({ traits: [{ name: 'X', type: 'nectar', grantsSenses: [{ sense: '' }, { nope: 1 }, { sense: 'MIND', effectiveness: 7 }] }] });
    expect(mindSensesOf(p)).toEqual([{ name: 'X', effectiveness: 1 }]);
  });

  it('the forge schemas keep grantsSenses on items, abilities and traits', () => {
    const g = [{ sense: 'mind', effectiveness: 0.5, name: 'mind reading' }];
    const item = validateForgeData('item', { description: 'a circlet', grantsSenses: g, itemAbilities: [{ name: 'Thoughtcatch', description: 'hears thoughts', grantsSenses: g }] }) as { grantsSenses?: unknown; itemAbilities?: Array<{ grantsSenses?: unknown }> };
    expect(item.grantsSenses).toEqual(g);
    expect(item.itemAbilities?.[0].grantsSenses).toEqual(g);
    const trait = validateForgeData('nectar', { description: 'reads minds', pillar: 'soul', grantsSenses: g }) as { grantsSenses?: unknown };
    expect(trait.grantsSenses).toEqual(g);
    expect(() => validateForgeData('nectar', { description: 'x', pillar: 'soul', grantsSenses: [{ sense: 'mind', effectiveness: 2 }] })).toThrow();
  });
});
