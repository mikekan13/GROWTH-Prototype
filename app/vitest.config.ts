import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Economy/unit test harness (T14). Tests are deterministic and DB-free: they
// exercise pure functions (ledger checksum chain, KV evaluator + death split,
// burn scaling, drip curve). The `@` alias mirrors tsconfig paths; `server-only`
// is stubbed so `import 'server-only'` modules (e.g. subscription-drip) load
// under the node test runner the same way Next aliases it during server builds.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
