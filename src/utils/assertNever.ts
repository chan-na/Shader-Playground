/**
 * Exhaustiveness guard for discriminated unions. Place in the `default:` arm
 * of a switch so the type system rejects any union member that is not
 * handled — new variants surface as compile errors instead of silent fallthrough.
 */
export function assertNever(x: never): never {
  throw new Error(`Unhandled discriminant: ${JSON.stringify(x as unknown)}`);
}
