/**
 * ai/network/tone-filter — the local tone-down every fiction payload passes
 * before it crosses the wall to a cloud lane (Mike 2026-10-12).
 *
 * Fiction MAY reach Claude, but only after the LOCAL model has toned down
 * graphic violence and sex. This is the ONE place that happens: route.ts
 * (prepareCloudText) and the JEWL runtime's cloud path both call it.
 *
 * TODO(unit 4): replace the identity stub with the local-lane tone-down
 * (Spirit pillar, inside the wall). Until then fiction crosses unchanged.
 */

/** Tone graphic content down for a cloud lane. Identity until unit 4. */
export function toneFilter(text: string): string {
  return text;
}
