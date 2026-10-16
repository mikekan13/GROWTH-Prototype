/** WHAT THE CAMERA SEES (Mike 2026-10-16) — Violet's real outfit and marks as the fixture. */
import { describe, it, expect } from 'vitest';
import { viewBody, clothesClause, marksClause, markZone, layerOf, type Piece } from './portrait-visibility';

const p = (name: string, region: string, material: string | null = null, description: string | null = null): Piece => ({ name, region, material, description, category: null });

const VIOLET: Piece[] = [
  p('The big cardigan', 'Body/Torso', 'Wool'),
  p('The black tee', 'Body/Torso', 'Cotton'),
  p('The everyday bra', 'Body/Torso', 'Cotton'),
  p('The good jeans', 'Body/Left Upper Leg', 'Denim'),
  p('The left black boot', 'Body/Left Upper Leg/Left Lower Leg/Left Foot', 'Leather'),
  p('The right black boot', 'Body/Right Upper Leg/Right Lower Leg/Right Foot', 'Leather'),
];
const MARKS = [
  'a cross belly button piercing',
  'a small thin white scar on her clavicle',
  'a tattoo down the left forearm',
  '"777" running down the middle of her tattoo on her arm',
];

describe('viewBody — waist up, facing the viewer', () => {
  it('the open cardigan hangs over the tee; the jeans, boots and bra are out of sight (the frame stops at the lower ribs)', () => {
    const v = viewBody(VIOLET, MARKS);
    expect(clothesClause(v, 'she')).toBe('wearing the big cardigan of wool hanging open over the black tee of cotton');
    expect(v.unseen.map(x => x.name)).toEqual(['The everyday bra', 'The good jeans', 'The left black boot', 'The right black boot']);
  });
  it('marks under the cloth are never named; the clavicle scar is half-hidden by the tee\'s neckline', () => {
    const v = viewBody(VIOLET, MARKS);
    expect(v.marks.map(m => m.view)).toEqual(['hidden', 'edge', 'hidden', 'hidden']);
    const clause = marksClause(v);
    expect(clause).toBe('keeping every mark exactly as it is — a small thin white scar on her clavicle, half-hidden by the edge of the black tee');
    expect(clause).not.toMatch(/piercing|tattoo|777/);
  });
  it('a tee alone leaves the forearm tattoo bare; a tank leaves the upper arm bare too', () => {
    expect(viewBody([p('The black tee', 'Body/Torso')], ['a tattoo down the left forearm']).marks[0].view).toBe('shown');
    expect(viewBody([p('A white tank', 'Body/Torso')], ['a rose on her shoulder']).marks[0].view).toBe('shown');
    expect(viewBody([p('The black tee', 'Body/Torso')], ['a rose on her shoulder']).marks[0].view).toBe('hidden');
  });
  it('sleeves rolled up (how it lies) bare the forearm under a sweater', () => {
    expect(viewBody([p('Grey sweater', 'Body/Torso', null, 'sleeves pushed up to the elbow')], ['a tattoo down the left forearm']).marks[0].view).toBe('shown');
    expect(viewBody([p('Grey sweater', 'Body/Torso')], ['a tattoo down the left forearm']).marks[0].view).toBe('hidden');
  });
  it('the camera angle: a back tattoo shows only when she faces away; legs only in the full figure', () => {
    expect(viewBody([], ['a tattoo across her back']).marks[0].view).toBe('hidden');
    expect(viewBody([], ['a tattoo across her back'], { frame: 'bust', facing: 'back' }).marks[0].view).toBe('shown');
    expect(viewBody([], ['a scar on her left knee']).marks[0].view).toBe('hidden');
    expect(viewBody([], ['a scar on her left knee'], { frame: 'figure', facing: 'front' }).marks[0].view).toBe('shown');
    expect(clothesClause(viewBody(VIOLET, [], { frame: 'figure', facing: 'front' }), 'she')).toContain('the left black boot of leather');
  });
  it('a buttoned cardigan closes; a watch under a long sleeve is not seen; a face mark always shows', () => {
    expect(layerOf(p('Cardigan', 'Body/Torso', null, 'buttoned to the top')).open).toBe(false);
    const v = viewBody([p('Wool coat', 'Body/Torso'), p('Silver watch', 'Body/Left Arm/Left Hand')], ['a scar through her left eyebrow']);
    expect(v.unseen.map(x => x.name)).toEqual(['Silver watch']);
    expect(v.marks[0].view).toBe('shown');
  });
  it('nothing on → the at-home line; underwear alone is named', () => {
    expect(clothesClause(viewBody([], []), 'she')).toBe('in the clothes she would wear at home');
    expect(clothesClause(viewBody([p('The everyday bra', 'Body/Torso')], []), 'she')).toContain('bra');
  });
  it('markZone: the first place named wins', () => {
    expect(markZone('"777" running down the middle of her tattoo on her arm')).toBe('forearms');
    expect(markZone('a scar on her neck: a short pale line at the clavicle')).toBe('neck');
    expect(markZone('a cross belly button piercing')).toBe('belly');
    expect(markZone('a lucky charm')).toBeNull();
  });
});
