import { describe, it, expect } from 'vitest';
import {
  CAMPAIGN_MOODS,
  DEFAULT_MOOD,
  GROWTH_MEDIUM,
  getCampaignMood,
  getThemeModifier,
  renderMood,
  resolveMoodKey,
} from './style-config';

const sentences = (s: string): string[] => s.match(/[^.]+\./g) ?? [];

describe('MEDIUM layer', () => {
  it('is at most 4 sentences, subject-agnostic, and carries no mood words', () => {
    expect(sentences(GROWTH_MEDIUM).length).toBeLessThanOrEqual(4);
    expect(GROWTH_MEDIUM).not.toMatch(/skin tone|freckle|make-?up|blonde|brunette|\bwoman\b|\bman\b/i);
    expect(GROWTH_MEDIUM).not.toMatch(/dark fantasy|sci-?fi|grim|somber|ominous|mood|atmosphere/i);
    expect(GROWTH_MEDIUM).toMatch(/not anime/);
    expect(GROWTH_MEDIUM).toMatch(/no grain, no noise, no HDR/);
  });
});

describe('MOOD layer', () => {
  it('has every ruled genre', () => {
    for (const k of ['growth', 'horror', 'dark fantasy', 'high fantasy', 'sci-fi', 'romance', 'mystery', 'western', 'gothic', 'nautical', 'steampunk']) {
      expect(CAMPAIGN_MOODS[k]).toBeDefined();
    }
  });

  it('each mood renders to at most 2 sentences with no medium or subject words', () => {
    for (const [k, m] of Object.entries(CAMPAIGN_MOODS)) {
      const s = renderMood(m);
      expect(sentences(s).length, k).toBeLessThanOrEqual(2);
      expect(s, k).not.toMatch(/paint|illustration|brush|anime|photo|grain|matte|porcelain|skin|hair|face|eyes/i);
    }
  });

  it('resolves styleMood, then genre (free text), then growth', () => {
    expect(resolveMoodKey()).toBe(DEFAULT_MOOD);
    expect(resolveMoodKey('')).toBe('growth');
    expect(resolveMoodKey('Horror')).toBe('horror');
    expect(resolveMoodKey('Sci-Fi')).toBe('sci-fi');
    expect(resolveMoodKey('science fiction')).toBe('sci-fi');
    expect(resolveMoodKey('Dark Fantasy Horror')).toBe('dark fantasy'); // longest term wins
    expect(resolveMoodKey('Victorian steampunk adventure')).toBe('steampunk');
    expect(resolveMoodKey('slice of life')).toBe('growth');
    expect(resolveMoodKey({ styleMood: 'western', genre: 'horror' })).toBe('western');
    expect(resolveMoodKey({ styleMood: 'nonsense', genre: 'horror' })).toBe('horror');
    expect(resolveMoodKey({ genre: null })).toBe('growth');
  });

  it('getCampaignMood + legacy getThemeModifier', () => {
    expect(getCampaignMood('nope')).toBe(renderMood(CAMPAIGN_MOODS.growth));
    expect(getThemeModifier('horror')).toBe(renderMood(CAMPAIGN_MOODS.horror));
    expect(getThemeModifier('slice of life')).toBeUndefined();
  });
});
