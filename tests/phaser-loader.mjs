/**
 * Node module-resolution hook: redirects the bare "phaser" specifier to our
 * stub so headless tests can import game modules without a DOM or WebGL.
 * Registered via `node --import ./tests/register-phaser-stub.mjs`.
 */

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'phaser') {
    return { url: new URL('./phaser-stub.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
