// Stub for Node-only builtins (net/tls/perf_hooks) that must not resolve in the
// browser bundle. Webpack handles this via `resolve.fallback: false`; Turbopack
// has no equivalent, so it aliases these to this empty module under the
// `browser` condition. postgres/redis reach the client graph through shared
// modules but their Node paths never execute there.
module.exports = {}
