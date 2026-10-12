import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { route, prepareCloudText, WallViolationError } from '../route';
import type { ContentClass } from '../types';

const LOCAL_VARS = ['AI_LOCAL_BASE_URL', 'DAYA_L1_URL'];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(LOCAL_VARS.map((k) => [k, process.env[k]]));
  for (const k of LOCAL_VARS) delete process.env[k];
});
afterEach(() => {
  for (const k of LOCAL_VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const task = (contentClass: ContentClass, lane: 'judgment' | 'classify' | 'local' = 'judgment') =>
  ({ caller: 'test', lane, contentClass });

describe('route() — content classes', () => {
  it('fiction goes to the requested cloud lane', () => {
    const lane = route(task('fiction'));
    expect(lane.lane).toBe('judgment');
    expect(lane.crossesWall).toBe(true);
  });

  it.each(['table', 'real'] as const)('%s with no local lane fails closed — never cloud', (c) => {
    expect(() => route(task(c))).toThrow(WallViolationError);
  });

  it.each(['table', 'real'] as const)('%s goes local when the local lane is live', (c) => {
    process.env.AI_LOCAL_BASE_URL = 'http://local.test/v1';
    const lane = route(task(c, 'classify'));
    expect(lane.lane).toBe('local');
    expect(lane.crossesWall).toBe(false);
  });
});

describe('prepareCloudText()', () => {
  it('passes fiction through the identifier wall on a cloud lane', async () => {
    const lane = route(task('fiction'));
    expect(await prepareCloudText(task('fiction'), lane, 'Mike Kantack opens the door', ['Mike Kantack'])).not.toContain('Mike Kantack');
  });

  it('refuses table content on a cloud lane', async () => {
    const lane = route(task('fiction'));
    await expect(prepareCloudText(task('table'), lane, 'hang on, bathroom break')).rejects.toThrow(WallViolationError);
  });

  it('leaves text untouched inside the wall', async () => {
    process.env.AI_LOCAL_BASE_URL = 'http://local.test/v1';
    const lane = route(task('table'));
    expect(await prepareCloudText(task('table'), lane, 'hang on, cycle 3')).toBe('hang on, cycle 3');
  });
});
