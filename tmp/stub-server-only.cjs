// Let a tsx script import app services that begin with `import 'server-only'` (the package throws outside Next's server runtime).
const Module = require('node:module');
const origResolve = Module._resolveFilename;
const STUB = require.resolve('./server-only-stub.cjs');
Module._resolveFilename = function (request, ...rest) {
  if (request === 'server-only') return STUB;
  return origResolve.call(this, request, ...rest);
};
