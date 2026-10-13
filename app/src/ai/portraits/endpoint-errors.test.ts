import { describe, it, expect } from 'vitest';
import { endpointErrorFromStatus, endpointUnreachable } from './endpoint-errors';
import { errorResponse } from '@/lib/api';

describe('endpoint error mapping', () => {
  it('409 -> ENDPOINT_PAUSED with the exact admin message', async () => {
    const e = endpointErrorFromStatus(409)!;
    expect(e.code).toBe('ENDPOINT_PAUSED');
    const res = errorResponse(e);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'ENDPOINT_PAUSED',
      message: 'The portrait endpoint is paused. Ask the admin to resume it.',
    });
  });

  it('401/403 -> ENDPOINT_AUTH, 5xx -> ENDPOINT_ERROR, network -> ENDPOINT_UNREACHABLE', () => {
    expect(endpointErrorFromStatus(401)!.code).toBe('ENDPOINT_AUTH');
    expect(endpointErrorFromStatus(403)!.code).toBe('ENDPOINT_AUTH');
    expect(endpointErrorFromStatus(500)!.code).toBe('ENDPOINT_ERROR');
    expect(endpointErrorFromStatus(503)!.status).toBe(502);
    const u = endpointUnreachable(new Error('ECONNREFUSED'));
    expect(u.code).toBe('ENDPOINT_UNREACHABLE');
    expect(u.status).toBe(503);
  });

  it('other statuses are not endpoint-health errors', () => {
    expect(endpointErrorFromStatus(400)).toBeNull();
    expect(endpointErrorFromStatus(404)).toBeNull();
  });
});
