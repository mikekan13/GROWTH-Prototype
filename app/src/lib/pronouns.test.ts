import { describe, expect, it } from 'vitest';
import { possessiveFor, pronounsFor, pronounsForSheet, sheetSex, withPronouns } from './appearance-designer';

describe('pronounsFor', () => {
  it('reads the sheet\'s sex the way possessiveFor does', () => {
    expect(pronounsFor('female')).toEqual({ subject: 'she', object: 'her', possessive: 'her', reflexive: 'herself', is: 'is', has: 'has' });
    expect(pronounsFor('Male')).toEqual({ subject: 'he', object: 'him', possessive: 'his', reflexive: 'himself', is: 'is', has: 'has' });
    expect(pronounsFor('man')).toMatchObject({ subject: 'he' });
    expect(pronounsFor('F')).toMatchObject({ subject: 'she' });
  });

  it('falls back to they for anything unclear', () => {
    for (const sex of [undefined, null, '', 'nonbinary', 'unknown', '?']) {
      expect(pronounsFor(sex)).toEqual({ subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself', is: 'are', has: 'have' });
    }
  });

  it('agrees with possessiveFor', () => {
    for (const sex of ['female', 'male', 'other', undefined]) expect(pronounsFor(sex).possessive).toBe(possessiveFor(sex));
  });
});

describe('sheetSex / pronounsForSheet', () => {
  it('prefers identity.sex, then the designer\'s physicalDescription.gender', () => {
    expect(sheetSex({ identity: { sex: 'male', physicalDescription: { gender: 'female' } } })).toBe('male');
    expect(sheetSex({ identity: { physicalDescription: { gender: 'male' } } })).toBe('male');
    expect(pronounsForSheet({ identity: { physicalDescription: { gender: 'male' } } }).subject).toBe('he');
  });

  it('takes the sheet as a JSON string too, and shrugs at garbage', () => {
    expect(pronounsForSheet(JSON.stringify({ identity: { sex: 'female' } })).subject).toBe('she');
    expect(sheetSex('not json')).toBeNull();
    expect(sheetSex(null)).toBeNull();
    expect(sheetSex({ identity: { sex: '  ' } })).toBeNull();
    expect(pronounsForSheet(undefined).subject).toBe('they');
  });
});

describe('withPronouns', () => {
  it('fills every key and capitalizes on a capitalized key', () => {
    const he = pronounsFor('male');
    expect(withPronouns('{Subject} {is} here; {possessive} coat {has} a tear; dress {object} {reflexive}.', he))
      .toBe('He is here; his coat has a tear; dress him himself.');
    const they = pronounsFor(undefined);
    expect(withPronouns('{Possessive} seed — {subject} {have}', they)).toBe('Their seed — they {have}');
  });

  it('leaves unknown keys and plain braces alone', () => {
    expect(withPronouns('{nope} {} {subject}', pronounsFor('female'))).toBe('{nope} {} she');
  });
});
