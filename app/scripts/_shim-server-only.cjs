// Preloaded via --require to neutralize Next.js' "server-only" guard
// when running scripts directly under tsx (no webpack swap).
const path = require.resolve('server-only');
require.cache[path] = {
  id: path,
  filename: path,
  loaded: true,
  exports: {},
  children: [],
  paths: [],
};
