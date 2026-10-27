import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
import { resolveReferentsIn, amountInWords, figureIn } from './table-referents';

const receipt = { name: 'Chess Pizza receipt', text: '*** NOT PAID ***\nTOTAL DUE 22.97\nCUSTOMER: VIOLET' };
describe('referents the GM leaves to the world (HW8 run 7 #10, #2)', () => {
  it('says the number in words', () => {
    expect(amountInWords('22.97')).toBe('Twenty-two ninety-seven');
    expect(amountInWords('22.00')).toBe('Twenty-two dollars');
    expect(figureIn(receipt.text, 'price')).toBe('22.97');
  });
  it('"remember the price ... and says it through the door" becomes the spoken value from the receipt he holds', () => {
    const r = resolveReferentsIn('He tries to remember the price of the pizza and says it through the door.', { held: [receipt], memories: [], addressedName: 'Violet' });
    expect(r.kind).toBe('said');
    expect(r.message).toBe('He tries to remember the price of the pizza and says "Twenty-two ninety-seven" through the door.');
  });
  it('when nothing holds it, he honestly cannot', () => {
    const r = resolveReferentsIn('He tries to remember the price of the pizza and says it through the door.', { held: [], memories: [], addressedName: null });
    expect(r.kind).toBe('cannot');
    expect(r.message).toMatch(/but can't bring the number up/);
  });
  it('her name is the addressed being\'s name; quoted words are never touched', () => {
    expect(resolveReferentsIn('He says her name through the door.', { held: [], memories: [], addressedName: 'Violet Hale' }).message).toBe('He says "Violet" through the door.');
    const q = 'He says "it" quietly.';
    expect(resolveReferentsIn(q, { held: [receipt], memories: [], addressedName: null }).message).toBe(q);
  });
});
