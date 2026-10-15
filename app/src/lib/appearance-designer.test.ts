import { describe, it, expect } from 'vitest';
import {
  CLOTHING_NOTE, EMPTY_DESIGNER, composeMarkText, composeShapeText, composeTellText, currentLayer,
  deriveDesignerStatus, designerErrorLine, designerReducer, isClothingOrGear, layersDroppedBy,
  possessiveFor, restoreDesigner, withNothingElse, gateLine, readDesignerGate,
  editScope, markLayerKind, shapeCategoriesFor, markPlacesFor, RESTRICTED_NOTE, SCOPE_NOTE, BODY_ONLY_NOTE,
  type DesignerLayer, type DesignerState,
} from './appearance-designer';

describe('base-lock gate caption', () => {
  it('readDesignerGate reads metadata.gate defensively', () => {
    expect(readDesignerGate(null)).toBeNull();
    expect(readDesignerGate({ reasons: [] })).toBeNull();
    expect(readDesignerGate({ pass: false, reasons: ['clothed (x)', 3], attempts: 3, seed: 9, score: 0.5 })).toEqual({ pass: false, reasons: ['clothed (x)'], attempts: 3 });
  });
  it('gateLine: pass / re-rolled ×N / flagged / off / unavailable', () => {
    expect(gateLine(null)).toBeNull();
    expect(gateLine({ pass: true, reasons: [], attempts: 1 })).toBe('gate: pass');
    expect(gateLine({ pass: true, reasons: [], attempts: 3 })).toBe('re-rolled ×2');
    expect(gateLine({ pass: false, reasons: ['clothed (garment, strap or jewellery visible)'], attempts: 3 })).toBe('flagged: clothed');
    expect(gateLine({ pass: true, reasons: ['gate off'], attempts: 1, bypassed: true })).toBe('gate: off');
    expect(gateLine({ pass: true, reasons: ['gate unavailable: timeout after 20000ms'], attempts: 1 })).toBe('gate: unavailable');
  });
});

const L = (imagePath: string, kind: DesignerLayer['kind'] = 'jewl', text = imagePath): DesignerLayer =>
  ({ imagePath, text, kind, seed: 7, at: '2026-10-13T00:00:00.000Z' });

describe('instruction composition', () => {
  it('possessive from the sheet sex field', () => {
    expect(possessiveFor('female')).toBe('her');
    expect(possessiveFor('Male')).toBe('his');
    expect(possessiveFor('')).toBe('their');
    expect(possessiveFor(undefined)).toBe('their');
  });

  it('shape preset → sentence, own words win', () => {
    expect(composeShapeText('Hair', 'Short crop', '', 'her')).toBe('Change her hair to a short crop.');
    expect(withNothingElse(composeShapeText('Hair', 'Short crop', '', 'her')!))
      .toBe('Change her hair to a short crop. Change nothing else.');
    expect(composeShapeText('Underwear', null, 'a plain dark wrap', 'his')).toBe('Change his underwear: a plain dark wrap.');
    expect(composeShapeText('Hair', 'Short crop', 'silver streak at the temple.', 'her'))
      .toBe('Change her hair: silver streak at the temple.');
  });

  it('shape with no preset and no words → nothing to apply', () => {
    expect(composeShapeText('Hair', null, '  ', 'her')).toBeNull();
    expect(composeShapeText('Hair', 'Not a preset', '', 'her')).toBeNull();
    expect(composeShapeText('Underwear', null, '', 'her')).toBeNull();
  });

  it('marks: kind + where + optional description; a body mod needs its words', () => {
    expect(composeMarkText('Scar', 'Face', 'a thin pale line through the left eyebrow', 'her'))
      .toBe('Add a scar to her face: a thin pale line through the left eyebrow.');
    expect(composeMarkText('Piercing', 'Face', '', 'their')).toBe('Add a piercing to their face.');
    expect(composeMarkText('Makeup', 'Face', '', 'their')).toBe('Add makeup to their face.');
    expect(composeMarkText('Birthmark', 'Neck', 'a port-wine stain', 'her')).toBe('Add a birthmark to her neck: a port-wine stain.');
    expect(composeMarkText('Tattoo', 'Arms', 'a coiled serpent', 'his')).toBe('Add a tattoo to his arms: a coiled serpent.');
    expect(composeMarkText('Body mod', 'Arms', '', 'his')).toBe('');
    expect(composeMarkText('Body mod', 'Neck', 'stretched ear gauges', 'her')).toBe('Add a body modification to her neck: stretched ear gauges.');
    expect(markLayerKind('Body mod')).toBe('bodymod');
    expect(markLayerKind('Makeup')).toBe('makeup');
  });

  it('the tabs split the parts: FACE = hair + marks (face/neck); BODY = build + marks (anywhere) + underwear', () => {
    expect(shapeCategoriesFor('face')).toEqual(['Hair', 'Marks']);
    expect(shapeCategoriesFor('body')).toEqual(['Build', 'Marks', 'Underwear']);
    expect(markPlacesFor('face')).toEqual(['Face', 'Neck']);
    expect(markPlacesFor('body')).toEqual(['Neck', 'Arms', 'Hands', 'Torso', 'Back', 'Legs']);
    expect(composeShapeText('Build', 'Heavy', '', 'her')).toBe('Change her build to heavy-set.');
    expect(composeShapeText('Build', null, 'heavier, thick through the middle', 'his')).toBe('Change his build: heavier, thick through the middle.');
  });

  it('edit scope (Mike 2026-10-15): hair, marks; body build + underwear; nothing else', () => {
    for (const t of ['Change her hair to a short crop. Change nothing else.', 'Add a scar to her face.', 'A silver streak in the hair',
      'A small ring in the left nostril', 'Add a body modification to her neck: stretched ear gauges.', 'cut her hair short', 'a scar across her nose',
      'Add makeup to her face.', 'Add a birthmark to her neck.']) {
      expect(editScope(t, 'face'), t).toEqual({ ok: true });
    }
    for (const t of ['Change her underwear: a plain dark wrap.', 'Change her build to heavy-set.', 'Heavier, broad through the shoulders',
      'A tattoo down the left forearm', 'Add a scar to her torso.']) {
      expect(editScope(t, 'body'), t).toEqual({ ok: true });
    }
    expect(editScope('Older by ten years', 'face')).toEqual({ ok: false, line: RESTRICTED_NOTE });
    expect(editScope('Tired, dark circles', 'face')).toEqual({ ok: false, line: RESTRICTED_NOTE });
    expect(editScope('Fresh cut on the cheek', 'face')).toEqual({ ok: false, line: RESTRICTED_NOTE });
    expect(editScope('Make her look in her forties.', 'face')).toEqual({ ok: false, line: RESTRICTED_NOTE });
    expect(editScope('A bruise on his ribs', 'body')).toEqual({ ok: false, line: RESTRICTED_NOTE });
    expect(editScope('Change her eyes to green.', 'face')).toEqual({ ok: false, line: SCOPE_NOTE });
    expect(editScope('Make his skin pale.', 'face')).toEqual({ ok: false, line: SCOPE_NOTE });
    expect(editScope('Give her a red coat', 'face')).toEqual({ ok: false, line: CLOTHING_NOTE });
    expect(editScope('Change her underwear: a plain dark wrap.', 'face')).toEqual({ ok: false, line: BODY_ONLY_NOTE });
    expect(editScope('Change her build to heavy-set.', 'face')).toEqual({ ok: false, line: BODY_ONLY_NOTE });
  });

  it('tell: tidied, suffix never doubled', () => {
    expect(composeTellText('  older by ten years ')).toBe('Older by ten years.');
    expect(composeTellText('')).toBeNull();
    expect(composeTellText('Tired, dark circles. Change nothing else.')).toBe('Tired, dark circles.');
    expect(withNothingElse('Fresh cut on the cheek.')).toBe('Fresh cut on the cheek. Change nothing else.');
    expect(withNothingElse('Add a scar. Change nothing else.')).toBe('Add a scar. Change nothing else.');
  });
});

describe('clothing / gear guard (client)', () => {
  it('refuses clothing and gear', () => {
    for (const t of ['Give her a red coat', 'add ARMOR', 'plate armour', 'a sword on her hip', 'leather boots',
      'a silk gown', 'a necklace', 'jewelry on her wrists', 'a wide hat', 'new outfit', 'some clothes']) {
      expect(isClothingOrGear(t), t).toBe(true);
    }
  });
  it('lets body edits through (word boundaries)', () => {
    for (const t of ['Older by ten years', 'Tired, dark circles', 'Fresh cut on the cheek', 'that look, what a scar',
      'Change her hair to a short crop. Change nothing else.', 'Add a piercing to her face.', 'Add makeup to her face.',
      'chattering teeth', 'a wrinkled forehead']) {
      expect(isClothingOrGear(t), t).toBe(false);
    }
  });
});

describe('edit stack reducer', () => {
  const locked = designerReducer(EMPTY_DESIGNER, { type: 'lock', layer: L('/portraits/v/faces/base.png', 'jewl', 'Locked') });

  it('lock sets the base as layer 0 (kind base) and clears the body', () => {
    const withBody = designerReducer(locked, { type: 'body', imagePath: '/b.png' });
    const relocked = designerReducer(withBody, { type: 'lock', layer: L('/portraits/v/faces/base2.png') });
    expect(locked.layers).toHaveLength(1);
    expect(locked.layers[0].kind).toBe('base');
    expect(locked.baseImagePath).toBe('/portraits/v/faces/base.png');
    expect(relocked.layers.map(l => l.imagePath)).toEqual(['/portraits/v/faces/base2.png']);
    expect(relocked.bodyImagePath).toBeNull();
  });

  it('append needs a base; appends in order; current = newest', () => {
    expect(designerReducer(EMPTY_DESIGNER, { type: 'append', layer: L('/e1.png') })).toBe(EMPTY_DESIGNER);
    const s = [L('/e1.png', 'hair'), L('/e2.png', 'scar')].reduce<DesignerState>(
      (acc, layer) => designerReducer(acc, { type: 'append', layer }), locked);
    expect(s.layers.map(l => l.imagePath)).toEqual(['/portraits/v/faces/base.png', '/e1.png', '/e2.png']);
    expect(currentLayer(s)?.imagePath).toBe('/e2.png');
  });

  it('revertTo drops later layers; out of range is a no-op', () => {
    let s = designerReducer(locked, { type: 'append', layer: L('/e1.png') });
    s = designerReducer(s, { type: 'append', layer: L('/e2.png') });
    expect(layersDroppedBy(s, 0)).toBe(2);
    const back = designerReducer(s, { type: 'revertTo', index: 1 });
    expect(back.layers.map(l => l.imagePath)).toEqual(['/portraits/v/faces/base.png', '/e1.png']);
    expect(designerReducer(s, { type: 'revertTo', index: 9 })).toBe(s);
    expect(designerReducer(s, { type: 'revertTo', index: -1 })).toBe(s);
  });

  it('replaceTop swaps the newest layer (regenerate); on the base it moves baseImagePath', () => {
    const s = designerReducer(locked, { type: 'append', layer: L('/e1.png') });
    const r = designerReducer(s, { type: 'replaceTop', layer: L('/e1b.png') });
    expect(r.layers.map(l => l.imagePath)).toEqual(['/portraits/v/faces/base.png', '/e1b.png']);
    const rb = designerReducer(locked, { type: 'replaceTop', layer: { ...L('/base-b.png'), kind: 'base' } });
    expect(rb.baseImagePath).toBe('/base-b.png');
  });

  it('restores from identity JSON (round trip) and drops bad rows', () => {
    let s = designerReducer(locked, { type: 'append', layer: L('/e1.png', 'tattoo') });
    s = designerReducer(s, { type: 'levers', levers: { seed: 7, guidance: 1, steps: 25, refs: 1 } });
    s = designerReducer(s, { type: 'approved', imagePath: '/e1.png', at: 'now' });
    const json = JSON.parse(JSON.stringify({ designer: s, generatedBust: '/old.png' }));
    expect(restoreDesigner(json)).toEqual({ ...s, description: undefined, bodyImagePath: null });

    const messy = restoreDesigner({ designer: { layers: [{ imagePath: '/a.png', kind: 'hair' }, null, { text: 'no path' }, { imagePath: '/b.png', kind: 'weird' }] } });
    expect(messy.layers.map(l => [l.imagePath, l.kind])).toEqual([['/a.png', 'base'], ['/b.png', 'jewl']]);
    expect(messy.baseImagePath).toBe('/a.png');
  });

  it('legacy bust (no designer yet) starts as an approved base; nothing → empty', () => {
    const r = restoreDesigner({ generatedBust: '/portraits/v/bust.png', generatedFullBody: '/portraits/v/body.png' });
    expect(r.layers).toHaveLength(1);
    expect(r.bodyImagePath).toBe('/portraits/v/body.png');
    expect(deriveDesignerStatus(r)).toBe('approved');
    expect(restoreDesigner(null)).toEqual(EMPTY_DESIGNER);
  });
});

describe('status derivation', () => {
  it('awaiting → locked → approved → locked again after a new edit', () => {
    expect(deriveDesignerStatus(EMPTY_DESIGNER)).toBe('awaiting');
    const locked = designerReducer(EMPTY_DESIGNER, { type: 'lock', layer: L('/base.png') });
    expect(deriveDesignerStatus(locked)).toBe('locked');
    const approved = designerReducer(locked, { type: 'approved', imagePath: '/base.png', at: 'now' });
    expect(deriveDesignerStatus(approved)).toBe('approved');
    const edited = designerReducer(approved, { type: 'append', layer: L('/e1.png') });
    expect(deriveDesignerStatus(edited)).toBe('locked');
    expect(deriveDesignerStatus(designerReducer(edited, { type: 'revertTo', index: 0 }))).toBe('approved');
  });
});

describe('error line', () => {
  const fallback = (raw: string | null | undefined) => `plain:${raw ?? ''}`;
  it('maps endpoint codes and the guard; else falls back', () => {
    expect(designerErrorLine({ error: 'ENDPOINT_PAUSED', message: 'x' }, fallback)).toMatch(/paused or unreachable/);
    expect(designerErrorLine({ error: 'ENDPOINT_ERROR', message: 'boom' }, fallback)).toBe('plain:boom');
    expect(designerErrorLine({ error: 'CLOTHING_FROM_INVENTORY' }, fallback)).toBe(CLOTHING_NOTE);
    expect(designerErrorLine({ error: 'Seed first' }, fallback)).toBe('plain:Seed first');
    expect(designerErrorLine(null, fallback)).toBe('plain:');
  });
});
