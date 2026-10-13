import { PortraitEndpointError } from '@/lib/errors';

/**
 * Map a RunPod endpoint failure to ONE clear typed error each (a paused
 * endpoint used to surface as a 500 "pipeline returned null").
 * Returns null for statuses that are not endpoint-health problems.
 */
export function endpointErrorFromStatus(status: number, detail = ''): PortraitEndpointError | null {
  const tail = detail ? ` (${detail.slice(0, 200)})` : '';
  if (status === 409) {
    return new PortraitEndpointError('ENDPOINT_PAUSED', 'The portrait endpoint is paused. Ask the admin to resume it.', 409);
  }
  if (status === 401 || status === 403) {
    return new PortraitEndpointError('ENDPOINT_AUTH', `The portrait endpoint rejected our credentials (${status}). Ask the admin to check the RunPod API key.${tail}`, 502);
  }
  if (status >= 500) {
    return new PortraitEndpointError('ENDPOINT_ERROR', `The portrait endpoint failed upstream (${status}). Try again shortly.${tail}`, 502);
  }
  return null;
}

/** Network-level failure (connection refused, DNS, timeout) reaching the endpoint. */
export function endpointUnreachable(cause: unknown): PortraitEndpointError {
  const why = cause instanceof Error ? cause.message : String(cause);
  return new PortraitEndpointError('ENDPOINT_UNREACHABLE', `The portrait endpoint could not be reached (${why.slice(0, 200)}).`, 503);
}
