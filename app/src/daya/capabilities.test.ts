import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
const charFind = vi.fn();
const itemMany = vi.fn();
const itemUnique = vi.fn();
const edgeFirst = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    character: { findUnique: (...a: unknown[]) => charFind(...a) },
    campaignItem: { findMany: (...a: unknown[]) => itemMany(...a), findUnique: (...a: unknown[]) => itemUnique(...a) },
    entityRelationship: { findFirst: (...a: unknown[]) => edgeFirst(...a) },
  },
}));
import { capabilitiesFrom, capabilitiesOf, capabilityLines } from './capabilities';

const phone = { name: 'Phone', data: { itemAbilities: [{ name: 'Call', description: 'Reach someone far. Needs signal.' }, { name: 'Camera', description: 'Takes pictures' }], properties: ['Fragile'] } };
const car = { name: 'Honda', data: { itemAbilities: [{ name: 'Road Travel', description: 'Move fast on roads.' }] } };

describe('capabilitiesFrom', () => {
  it('maps a nectar to an aware "is"', () => {
    const c = capabilitiesFrom({ held: [], traits: [{ name: 'Ageless', type: 'nectar', pillar: 'body', description: 'Looks young. More.' }] });
    expect(c).toEqual([{ face: 'is', source: 'nectar', name: 'Ageless', line: 'NECTAR Ageless (body): Looks young.', aware: true }]);
  });
  it('a hidden thorn acts on them unaware', () => {
    const c = capabilitiesFrom({ held: [], traits: [{ name: 'Marked', type: 'thorn', description: 'Watched.', hidden: true }, { type: 'thorn' }] });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ face: 'actsOn', source: 'thorn', aware: false, line: 'THORN Marked: Watched.' });
  });
  it('held phone gives two abilities, ignores properties', () => {
    const c = capabilitiesFrom({ held: [phone] });
    expect(c.map((x) => x.line)).toEqual(['CAN Call (with the Phone): Reach someone far.', 'CAN Camera (with the Phone): Takes pictures']);
    expect(c.every((x) => x.face === 'can' && x.via === 'Phone' && x.source === 'item')).toBe(true);
  });
  it("a liability on a thing (negative KV, Dead Battery) ACTS ON the bearer rather than being something they can do (2026-11-05)", () => {
    const dead = { name: 'Work phone', data: { itemAbilities: [{ name: 'Connected', description: 'Instant communication.', kv: 8 }, { name: 'Dead Battery', description: 'Requires daily charging.', kv: -2 }] } };
    const c = capabilitiesFrom({ held: [dead] });
    expect(c.find((x) => x.name === 'Connected')?.face).toBe('can');
    const d = c.find((x) => x.name === 'Dead Battery');
    expect(d?.face).toBe('actsOn');
    expect(d?.aware).toBe(true);
    expect(d?.line).toBe('ACTS ON them: Dead Battery (the Work phone): Requires daily charging.');
  });
  it('inside a car gives Road Travel', () => {
    const c = capabilitiesFrom({ held: [], inside: car });
    expect(c).toEqual([{ face: 'can', source: 'inside', name: 'Road Travel', via: 'Honda', line: 'CAN Road Travel (in the Honda): Move fast on roads.', aware: true }]);
  });
  it('known spells, string and object forms', () => {
    const c = capabilitiesFrom({ held: [], magic: { mercy: { schools: [], knownSpells: ['Mend', { name: 'Soothe', description: 'Calms. Briefly.' }] } } });
    expect(c.map((x) => x.line)).toEqual(['CAN cast Mend', 'CAN cast Soothe: Calms.']);
    expect(c.every((x) => x.source === 'spell')).toBe(true);
  });
  it('only true conditions count', () => {
    const c = capabilitiesFrom({ held: [], conditions: { weak: true, clumsy: false } });
    expect(c).toEqual([{ face: 'actsOn', source: 'condition', name: 'weak', line: 'CONDITION weak: acts on them now', aware: true }]);
  });
  it('dedupes by source, name and via', () => {
    const c = capabilitiesFrom({ held: [phone, phone] });
    expect(c).toHaveLength(2);
  });
});

describe('capabilityLines', () => {
  const caps = capabilitiesFrom({
    held: [phone], inside: car,
    traits: [{ name: 'A', type: 'nectar' }, { name: 'B', type: 'thorn', hidden: true }],
    conditions: { weak: true },
  });
  it('filters by face and awareness', () => {
    expect(capabilityLines(caps, 'can')).toHaveLength(3);
    expect(capabilityLines(caps, 'is')).toEqual(['NECTAR A']);
    expect(capabilityLines(caps, 'actsOn')).toEqual(['THORN B', 'CONDITION weak: acts on them now']);
    expect(capabilityLines(caps, 'unaware')).toEqual(['THORN B']);
    expect(capabilityLines(caps, 'aware')).toHaveLength(caps.length - 1);
  });
});

describe('capabilitiesOf', () => {
  beforeEach(() => { charFind.mockReset(); itemMany.mockReset(); itemUnique.mockReset(); edgeFirst.mockReset(); });
  it('combines character, held items and the inside edge', async () => {
    charFind.mockResolvedValue({ data: JSON.stringify({ traits: [{ name: 'A', type: 'nectar' }], conditions: { weak: true } }) });
    itemMany.mockResolvedValue([{ name: 'Phone', data: JSON.stringify(phone.data) }]);
    edgeFirst.mockResolvedValue({ targetId: 'i9' });
    itemUnique.mockResolvedValue({ name: 'Honda', data: JSON.stringify(car.data) });
    const lines = capabilityLines(await capabilitiesOf('c1'), 'can');
    expect(lines).toContain('CAN Call (with the Phone): Reach someone far.');
    expect(lines).toContain('CAN Road Travel (in the Honda): Move fast on roads.');
  });
  it('returns [] when the character is missing or prisma throws', async () => {
    charFind.mockResolvedValue(null);
    expect(await capabilitiesOf('c1')).toEqual([]);
    charFind.mockRejectedValue(new Error('x'));
    expect(await capabilitiesOf('c1')).toEqual([]);
  });
});

describe('capabilitiesFrom — trait mechanics phrase (Dialed to Eleven)', () => {
  it('derives a phrase from mechanic data, generically', () => {
    const c = capabilitiesFrom({ held: [], traits: [
      { name: 'Dialed to Eleven', type: 'thorn', pillar: 'soul', description: 'Everything lands twice.', mechanics: [{ kind: 'pool_multiplier', pools: ['willpower', 'wisdom', 'wit'], factor: 2, direction: 'both' }] },
      { name: 'Splitting', type: 'blossom', description: 'All or nothing.', mechanics: [{ kind: 'effort_all_or_nothing' }] },
    ] });
    expect(c[0].line).toBe('THORN Dialed to Eleven (soul): Everything lands twice. [every change to Willpower/Wisdom/Wit is doubled]');
    expect(c[1].line).toContain('[Effort is all or nothing while this lasts]');
  });
});
