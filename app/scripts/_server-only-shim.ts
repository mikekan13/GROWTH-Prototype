/**
 * Tsx-time shim for the `server-only` package. Next.js aliases this package
 * to an empty module during server builds; tsx doesn't, so it throws at
 * import time. Pre-stubbing the require cache makes services importable
 * from CLI scripts (verify-build.ts, bootstrap, etc.) without removing the
 * runtime guards from production code paths.
 *
 * Usage: import this file FIRST in any tsx-run script that pulls in
 * `services/*` modules with `import 'server-only'` at their top.
 */

import { createRequire } from 'node:module';

// Use a creator-tied require so we get a real Node CJS require regardless
// of whether the host script is ESM or CJS.
const _require = createRequire(import.meta.url);
try {
  const path = _require.resolve('server-only');
  // Replace the cache entry with an empty exports module — same shape Next's
  // webpack alias resolves to during server compilation.
  (_require.cache as Record<string, { exports: unknown; loaded: boolean; id: string }>)[path] = {
    exports: {},
    loaded: true,
    id: path,
  };
} catch {
  // server-only isn't installed in this tree — nothing to shim.
}
