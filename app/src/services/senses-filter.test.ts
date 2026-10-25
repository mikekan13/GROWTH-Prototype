import { describe, it, expect } from 'vitest';
import { audibleOnly, audibleSentence } from './senses-filter';

describe('senses filter — hearing carries sound and words, nothing else (HW6 2026-10-25)', () => {
  const receipt = 'Kristopher looks over the recipt for the price of the pizza as a genuine smile masks the memory of the tears he was just crying on the drive over. He knocks again.';
  it('through a locked door, the receipt and the smile go; the knock stays', () => {
    expect(audibleOnly(receipt, ['hearing'])).toBe('He knocks again.');
  });
  it('a sound sentence is cut where it stops being sound', () => {
    expect(audibleSentence('He knocks on the door as a genuine smile masks the tears.')).toBe('He knocks on the door.');
    expect(audibleSentence('He gets close to the door and speaks loudly.')).toBe('He gets close to the door and speaks loudly.');
    expect(audibleSentence('His face looks tired and his eyes are red.')).toBeNull();
    expect(audibleSentence('Kristopher shifts in the hallway as he waits.')).toBeNull();
  });
  it('speech lines stay whole; sight or self leaves everything whole', () => {
    const line = 'He gets close to the door and speaks loudly.\nKristopher: hello? Anyone home?';
    expect(audibleOnly(line, ['hearing'])).toBe(line);
    expect(audibleOnly(receipt, ['sight', 'hearing'])).toBe(receipt);
    expect(audibleOnly(receipt, ['self'])).toBe(receipt);
    expect(audibleOnly(receipt, undefined)).toBe(receipt);
  });
  it('when nothing of it is sound, the judge\'s verdict stands and the stretch is handed over whole', () => {
    const silent = 'His face looks tired and his eyes are slightly red from crying in the car.';
    expect(audibleOnly(silent, ['hearing'])).toBe(silent);
  });
});
