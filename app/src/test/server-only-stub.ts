// Empty stand-in for the `server-only` package under the vitest runner.
// The real package throws when imported outside an RSC server build; Next
// aliases it to an empty module during server compilation and we do the same
// for tests (see vitest.config.ts). Runtime guards in production are unaffected.
export {};
