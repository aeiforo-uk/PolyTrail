/**
 * `server-only` throws on import outside a React Server Component, which is
 * exactly what it is for — and which makes any module that imports it
 * untestable under Vitest. Aliasing it to this empty module in the test config
 * keeps the guard in the build while letting the logic be unit-tested.
 */
export {};
