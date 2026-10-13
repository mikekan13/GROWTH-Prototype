import { describe, it, expect } from 'vitest';
import { entityLifecycle, defaultEntitySection, isAfterBirthSection, portraitErrorLine, type EntityStateReport } from './entity-view';

const base: EntityStateReport = { characterId: 'c1', name: 'V', genesisRunning: false, hasBust: false };

describe('entityLifecycle + defaultEntitySection', () => {
  it('member stage (no character) = creation → Sheet', () => {
    const l = entityLifecycle({ ...base, characterId: null });
    expect(l.born).toBe(false);
    expect(defaultEntitySection(l)).toBe('sheet');
  });
  it('genesis running = not born → Sheet; Appearance/Persona marked after birth', () => {
    const l = entityLifecycle({ ...base, genesisState: 'active', genesisRunning: true, genomeStage: 'gestating' });
    expect(l.born).toBe(false);
    expect(defaultEntitySection(l)).toBe('sheet');
    expect(isAfterBirthSection('appearance', l)).toBe(true);
    expect(isAfterBirthSection('persona', l)).toBe(true);
    expect(isAfterBirthSection('sheet', l)).toBe(false);
  });
  it('born, awaiting image → Appearance', () => {
    const l = entityLifecycle({ ...base, genesisState: 'done', completion: { genesis: 'born', image: 'pending' } });
    expect(l).toMatchObject({ born: true, awaitingImage: true });
    expect(defaultEntitySection(l)).toBe('appearance');
  });
  it('born with official image → Sheet', () => {
    const l = entityLifecycle({ ...base, completion: { genesis: 'born', image: 'done' }, hasBust: true });
    expect(l).toMatchObject({ born: true, awaitingImage: false, hasImage: true });
    expect(defaultEntitySection(l)).toBe('sheet');
  });
  it('legacy live character without completion: bust decides', () => {
    expect(defaultEntitySection(entityLifecycle({ ...base, status: 'ACTIVE', hasBust: true }))).toBe('sheet');
    expect(defaultEntitySection(entityLifecycle({ ...base, status: 'ACTIVE', hasBust: false }))).toBe('appearance');
  });
  it('a completion session on a born character keeps it born', () => {
    const l = entityLifecycle({ ...base, genesisState: 'active', genesisRunning: true, completion: { genesis: 'born', image: 'done' }, hasBust: true });
    expect(l.born).toBe(true);
  });
});

describe('portraitErrorLine', () => {
  it('maps paused/unreachable endpoint failures to one plain line', () => {
    for (const raw of [
      'Serverless queue failed (503): {"error":"no workers"}',
      'fetch failed',
      'Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON',
      'ComfyUI not responding',
      'Serverless generation timed out after 30 minutes',
    ]) {
      expect(portraitErrorLine(raw)).toMatch(/paused or unreachable/);
    }
  });
  it('passes human messages through, first line only', () => {
    expect(portraitErrorLine("Write the character's story first.\nstack...")).toBe("Write the character's story first.");
  });
  it('empty → a plain line', () => {
    expect(portraitErrorLine('')).toMatch(/did not answer/);
  });
});
