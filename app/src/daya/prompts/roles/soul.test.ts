import { describe, it, expect } from 'vitest';
import { buildDeltaSummary, buildSoulPrompt } from './soul';

describe('buildDeltaSummary (mapping conventions, pure)', () => {
  it('renders full vitality and quiet baseline when nothing is extreme', () => {
    const out = buildDeltaSummary({ affect: { morale: 0, stress: 0, grief: 0 }, poolFraction: 1 });
    expect(out).toContain('vitality full');
    expect(out).not.toContain('fog');
  });

  it('renders drained pool as nearly-spent vitality language', () => {
    const out = buildDeltaSummary({ affect: { morale: 0, stress: 0, grief: 0 }, poolFraction: 0.1 });
    expect(out).toContain('vitality nearly spent');
  });

  it('renders high stress as sharpened vigilance', () => {
    const out = buildDeltaSummary({ affect: { morale: 0, stress: 0.8, grief: 0 }, poolFraction: 1 });
    expect(out).toContain('vigilance sharp');
  });

  it('renders high grief as heavy absence imagery', () => {
    const out = buildDeltaSummary({ affect: { morale: 0, stress: 0, grief: 0.7 }, poolFraction: 1 });
    expect(out).toContain('heavy absence');
  });

  it('renders low degradation as fog', () => {
    const out = buildDeltaSummary({ affect: { morale: 0, stress: 0, grief: 0 }, poolFraction: 1, degradation: 0.3 });
    expect(out).toContain('fog');
  });

  it('passes through pre-rendered Thorn felt-shape strings verbatim, never mechanic names', () => {
    const out = buildDeltaSummary({
      affect: { morale: 0, stress: 0, grief: 0 },
      poolFraction: 1,
      thornDescriptors: ['crowds put your back against a wall'],
    });
    expect(out).toContain('crowds put your back against a wall');
  });

  it('never contains raw numbers from the affect vector', () => {
    const out = buildDeltaSummary({ affect: { morale: 0.42, stress: 0.77, grief: 0.13 }, poolFraction: 0.55 });
    expect(out).not.toMatch(/0\.\d+/);
  });
});

describe('buildSoulPrompt', () => {
  it('instructs never to echo numbers/measurements/systems', () => {
    const prompt = buildSoulPrompt({ stateJson: '{"morale":0.1}', deltaSummary: 'quiet' });
    expect(prompt).toMatch(/never mention numbers/i);
    expect(prompt).toContain('quiet');
  });
});
