import { describe, it, expect } from 'vitest';
import { recipeAllows, derivedValue, partsFromRecipe, partsOf, isComposed, partCount, tenderTotal, partsInWords, pickTender, takeParts, addParts, dataForParts, nameForParts, billOf } from './parts';

const USD = { currencyId: 'usd', code: 'USD' };
const twenty = billOf('twenty-dollar bill', 2, { ...USD, faceValue: 20 }, { weightLbs: 0.002 });
const five = billOf('five-dollar bill', 1, { ...USD, faceValue: 5 }, { weightLbs: 0.002 });
const one = billOf('one-dollar bill', 3, { ...USD, faceValue: 1 }, { weightLbs: 0.002 });
const dollars = (n: number, code: string) => (code === 'USD' ? `$${Math.round(n * 100) / 100}` : `${n} ${code}`);

describe('parts of a thing', () => {
  it('a parts lists its parts; a legacy quantity is a parts of itself; a lone bill is one part', () => {
    expect(partsOf('Wad of cash', { parts: [twenty, five] })).toEqual([twenty, five]);
    expect(partsOf('Arrows', { quantity: 20 })).toEqual([{ name: 'Arrows', count: 20 }]);
    expect(partsOf('A twenty', { tender: { ...USD, faceValue: 20 }, weightLbs: 0.002 })).toEqual([{ name: 'A twenty', count: 1, each: { tender: { ...USD, faceValue: 20 }, weightLbs: 0.002 } }]);
    expect(partsOf('The couch', {})).toEqual([{ name: 'The couch', count: 1 }]);
    expect(isComposed({ parts: [five] })).toBe(true);
    expect(isComposed({ quantity: 6 })).toBe(true);
    expect(isComposed({ tender: { ...USD, faceValue: 5 } })).toBe(false);
  });
  it('counts and totals', () => {
    expect(partCount([twenty, five, one])).toBe(6);
    expect(tenderTotal([twenty, five, one])).toBe(48);
    expect(tenderTotal([twenty, five], 'eur')).toBe(0);
  });
});

describe('in words', () => {
  it('says bills by their face and totals the money', () => {
    expect(partsInWords([twenty, five], dollars)).toBe('two twenties and a five ($45)');
    expect(partsInWords([{ ...twenty, count: 1 }, five], dollars)).toBe('a twenty and a five ($25)');
    expect(partsInWords([{ ...five, count: 1 }], dollars)).toBe('a five ($5)');
  });
  it('says other partss plainly', () => {
    expect(partsInWords([{ name: 'arrow', count: 20 }])).toBe('20 arrows');
    expect(partsInWords([{ name: 'split log', count: 8 }, { name: 'kindling parts', count: 1 }])).toBe('eight split logs and a kindling parts');
  });
});

describe('picking tender to pay', () => {
  it('two twenties and a five cannot make 22.97: a twenty and a five, 2.03 over', () => {
    const p = pickTender([twenty, five], 22.97)!;
    expect(p.picks).toEqual([{ name: 'twenty-dollar bill', count: 1 }, { name: 'five-dollar bill', count: 1 }]);
    expect(p.handed).toBe(25);
    expect(p.over).toBe(2.03);
    expect(p.code).toBe('USD');
  });
  it('exact when it can be exact, with the fewest pieces', () => {
    const p = pickTender([twenty, five, one], 23)!;
    expect(p.handed).toBe(23);
    expect(p.over).toBe(0);
    expect(p.picks).toEqual([{ name: 'twenty-dollar bill', count: 1 }, { name: 'one-dollar bill', count: 3 }]);
    const q = pickTender([twenty, five, one], 5)!;
    expect(q.picks).toEqual([{ name: 'five-dollar bill', count: 1 }]);
  });
  it('null when there is not enough, or no money of that currency', () => {
    expect(pickTender([five], 22.97)).toBeNull();
    expect(pickTender([{ name: 'arrow', count: 20 }], 1)).toBeNull();
    expect(pickTender([twenty], 10, 'eur')).toBeNull();
  });
});

describe('bound parts stay in the thing', () => {
  const rope = [{ name: 'wool cord, knotted 33 times', count: 1, bound: true, each: { primaryMaterial: 'Wool' } }, { name: 'blue plastic bead', count: 3, bound: true, each: { primaryMaterial: 'Polymer' } }];
  it('a prayer rope is composed; its beads are not loose', () => {
    expect(isComposed({ parts: rope })).toBe(true);
    expect(partsInWords(rope)).toBe('a wool cord, knotted 33 times and three blue plastic beads');
    expect(() => takeParts(rope, [{ name: 'blue plastic bead', count: 1 }])).toThrow(/unmaking/);
    expect(takeParts(rope, [{ name: 'blue plastic bead', count: 1 }], { unmake: true }).taken).toEqual([{ name: 'blue plastic bead', count: 1, each: rope[1].each }]); // what left is loose now
  });
  it('a coin sewn into a hem is money owned but not money a hand can pay with', () => {
    const sewn = [{ ...five, count: 1, bound: true }, { ...twenty, count: 1 }];
    expect(tenderTotal(sewn)).toBe(25);
    expect(pickTender(sewn, 5)!.picks).toEqual([{ name: 'twenty-dollar bill', count: 1 }]);
  });
});

describe('splitting and joining', () => {
  it('takes picks out and keeps the rest', () => {
    const { left, taken } = takeParts([twenty, five], [{ name: 'twenty-dollar bill', count: 1 }, { name: 'five-dollar bill', count: 1 }]);
    expect(left).toEqual([{ ...twenty, count: 1 }]);
    expect(taken).toEqual([{ ...twenty, count: 1 }, five]);
    expect(() => takeParts([five], [{ name: 'five-dollar bill', count: 2 }])).toThrow(/no 2 five-dollar bill/);
  });
  it('alike kinds merge', () => {
    expect(addParts([{ ...twenty, count: 1 }], [{ ...twenty, count: 1 }, five])).toEqual([twenty, five]);
  });
  it('the data for what left: a parts for many, tender for one, weight summed, no stale quantity or state', () => {
    const src = { description: 'Folded bills.', primaryMaterial: 'Paper', quantity: 1, state: 'two twenties and a five', parts: [twenty, five] };
    const many = dataForParts(src, [{ ...twenty, count: 1 }, five]);
    expect(many.parts).toEqual([{ ...twenty, count: 1 }, five]);
    expect(many.weightLbs).toBe(0.004);
    expect((many as { quantity?: number }).quantity).toBeUndefined();
    expect((many as { state?: string }).state).toBeUndefined();
    expect(many.primaryMaterial).toBe('Paper');
    const lone = dataForParts(src, [{ ...five, count: 1 }]);
    expect(lone.tender).toEqual({ ...USD, faceValue: 5 });
    expect(lone.parts).toBeUndefined();
  });
  it('names what left', () => {
    expect(nameForParts([{ ...five, count: 1 }])).toBe('five-dollar bill');
    expect(nameForParts([{ ...twenty, count: 1 }, five])).toBe('A twenty and a five');
    expect(nameForParts([{ name: 'arrow', count: 3 }])).toBe('Three arrows');
  });
});

describe("the recipe law: an instance never strays from its archetype's KV", () => {
  const ropeRecipe = [{ name: 'wool cord, knotted 100 times', count: 1, bound: true, each: { value: 0.08, primaryMaterial: 'Wool' } }, { name: 'blue plastic bead', count: 3, bound: true, each: { value: 0.005, primaryMaterial: 'Polymer' } }];
  const wadRecipe = [twenty, five, one].map((b) => ({ ...b, count: 1, each: { ...b.each, value: 0 } }));
  it('paint on a bound part is fine; another count or another part is another thing', () => {
    expect(recipeAllows(ropeRecipe, [{ ...ropeRecipe[0] }, { ...ropeRecipe[1], each: { description: 'sky blue' } }])).toEqual({ ok: true });
    expect(recipeAllows(ropeRecipe, [{ ...ropeRecipe[0] }, { ...ropeRecipe[1], count: 4 }]).ok).toBe(false);
    expect(recipeAllows(ropeRecipe, [...ropeRecipe, { name: 'gold bead', count: 1 }]).ok).toBe(false);
    expect(recipeAllows(ropeRecipe, [ropeRecipe[0]]).ok).toBe(false);
  });
  it('counts of loose parts move freely: a wad is a wad with any bills the recipe names', () => {
    expect(recipeAllows(wadRecipe, [{ ...twenty, count: 2 }, { ...five, count: 1 }])).toEqual({ ok: true });
    expect(recipeAllows(wadRecipe, [{ name: 'fifty-dollar bill', count: 1, each: { tender: { ...USD, faceValue: 50 } } }]).ok).toBe(false);
  });
  it("money recipes name no faces: 'any denomination of this currency' — the faces live on the Currency (an alien world with 32 crystal currencies)", () => {
    const cashRecipe = [{ name: 'tender of the United States Dollar', count: 1, each: { tenderOf: 'usd', value: 0, primaryMaterial: 'Paper' } }];
    const faces = new Map([['usd', [{ name: 'one-dollar bill', faceValue: 1, weightLbs: 0.002 }, { name: 'five-dollar bill', faceValue: 5, weightLbs: 0.002 }, { name: 'twenty-dollar bill', faceValue: 20, weightLbs: 0.002 }]]]);
    expect(recipeAllows(cashRecipe, [{ ...twenty, count: 2 }, five], faces)).toEqual({ ok: true });
    expect(recipeAllows(cashRecipe, [{ name: 'fifty-dollar bill', count: 1, each: { tender: { ...USD, faceValue: 50 } } }], faces).ok).toBe(false);
    expect(recipeAllows(cashRecipe, [{ name: 'blue shard', count: 3, each: { tender: { currencyId: 'shards', code: 'SHD', faceValue: 1 } } }], faces).ok).toBe(false);
    // No denominations listed yet: the currency itself vouches.
    expect(recipeAllows(cashRecipe, [{ name: 'fifty-dollar bill', count: 1, each: { tender: { ...USD, faceValue: 50 } } }])).toEqual({ ok: true });
    const inst = partsFromRecipe(cashRecipe, [{ name: 'a twenty', count: 2, each: { tender: { ...USD, faceValue: 20 } } }], faces);
    expect(inst[0]).toEqual({ name: 'twenty-dollar bill', count: 2, each: { value: 0, primaryMaterial: 'Paper', weightLbs: 0.002, tender: { ...USD, faceValue: 20 } } });
  });
  it('KV derives from the parts when they carry one', () => {
    expect(derivedValue(ropeRecipe)).toBe(0.095);
    expect(derivedValue([{ name: 'arrow', count: 20, each: { value: 0.01 } }])).toBe(0.2);
    expect(derivedValue([{ name: 'arrow', count: 20 }])).toBeNull();
  });
  it('the recipe lays its truths under the instance; paint stays on top', () => {
    const inst = partsFromRecipe(ropeRecipe, [{ name: 'Wool cord, knotted 100 times', count: 1 }, { name: 'blue plastic bead', count: 3, each: { description: 'sky blue' } }]);
    expect(inst[0]).toEqual({ ...ropeRecipe[0] });
    expect(inst[1].each).toEqual({ value: 0.005, primaryMaterial: 'Polymer', description: 'sky blue' });
    expect(inst[1].bound).toBe(true);
  });
});
