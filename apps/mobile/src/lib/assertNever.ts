/**
 * Exhaustiveness guard for `switch` statements over union types. TypeScript refuses to compile
 * a call site whose argument is not `never`, so adding a union member without handling it fails
 * `npm run typecheck` instead of silently falling through at runtime.
 */
export function assertNever(value: never, message = 'Unexpected value'): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}
