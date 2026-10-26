import { describe, it, expect } from 'vitest';
import { audibleOnly, audibleSentence } from './senses-filter';

describe('hearing never hands over sight (HW8 run 3, 2026-10-25: "a hard fail")', () => {
  it('"smiles… and gently knocks" keeps the knock and drops the smile; "approaches… as he wipes the tears" keeps the steps', () => {
    const seed = 'Kristopher approaches the door as he wipes the tears from the car ride away. He remembers this customer. He smiles a genuine smile and gently knocks three times on the door.';
    const heard = audibleOnly(seed, ['hearing']);
    expect(heard).toContain('knocks three times on the door');
    expect(heard).toContain('approaches the door');
    expect(heard).not.toMatch(/tears|smile|remembers|customer/);
  });
  it('when nothing of it sounds as a sentence, the sounding fragments go over, never the whole', () => {
    expect(audibleOnly('A genuine warmth breaks across his face and he knocks, softly.', ['hearing'])).not.toMatch(/warmth|face/);
    expect(audibleOnly('A genuine warmth breaks across his face and he knocks, softly.', ['hearing'])).toMatch(/knocks/);
  });
  it('when nothing of it sounds at all, a true line about an unplaceable sound', () => {
    expect(audibleOnly('He adjusts his visor and reads the receipt.', ['hearing'])).toBe('A sound from beyond the room, too faint to make out.');
    // "crying" inside "red from crying in the car" is not a sound happening now (HW7): no fragment, no whole.
    expect(audibleOnly('His face looks tired and his eyes are slightly red from crying in the car.', ['hearing'])).toBe('A sound from beyond the room, too faint to make out.');
  });
});

describe('senses filter — hearing carries sound and words, nothing else (HW6 2026-10-25)', () => {
  const receipt = 'Kristopher looks over the recipt for the price of the pizza as a genuine smile masks the memory of the tears he was just crying on the drive over. He knocks again.';
  it('through a locked door, the receipt and the smile go; the knock stays', () => {
    expect(audibleOnly(receipt, ['hearing'])).toBe('He knocks again.');
  });
  it('a sound sentence is cut where it stops being sound', () => {
    expect(audibleSentence('He knocks on the door as a genuine smile masks the tears.')).toBe('He knocks on the door.');
    // Getting close is not a sound; the speaking is.
    expect(audibleSentence('He gets close to the door and speaks loudly.')).toBe('He speaks loudly.');
    expect(audibleSentence('His face looks tired and his eyes are red.')).toBeNull();
    expect(audibleSentence('Kristopher shifts in the hallway as he waits.')).toBeNull();
    // The sound must be the main verb: "crying" inside a sentence about wiping is not a sound through the door (HW7 2026-10-25).
    expect(audibleSentence('He wipes his eyes from the tears he was crying in the car.')).toBeNull();
    expect(audibleSentence('He cries into his sleeve.')).toBe('He cries into his sleeve.');
    expect(audibleSentence('The man knocks twice.')).toBe('The man knocks twice.');
    expect(audibleSentence('Someone slowly knocks again.')).toBe('Someone slowly knocks again.');
    // Several predicates: the silent one goes, the sounding one stays with the subject.
    expect(audibleSentence('He waits for a moment and then knocks again a little louder.')).toBe('He knocks again a little louder.');
    expect(audibleSentence('He knocks on the door and a genuine smile flutters across his face.')).toBe('He knocks on the door.');
  });
  it('speech lines stay whole; sight or self leaves everything whole', () => {
    const line = 'He gets close to the door and speaks loudly.\nKristopher: hello? Anyone home?';
    expect(audibleOnly(line, ['hearing'])).toBe('He speaks loudly.\nKristopher: hello? Anyone home?');
    expect(audibleOnly(receipt, ['sight', 'hearing'])).toBe(receipt);
    expect(audibleOnly(receipt, ['self'])).toBe(receipt);
    expect(audibleOnly(receipt, undefined)).toBe(receipt);
  });
  it('when nothing of it is sound, hearing hands over an unplaceable sound — never the whole (HW8 run 3 superseded HW6 here)', () => {
    expect(audibleOnly('His face looks tired and his eyes are slightly red from crying in the car.', ['hearing'])).toBe('A sound from beyond the room, too faint to make out.');
  });
});
