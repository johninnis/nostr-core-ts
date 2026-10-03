import { NostrError } from "./nostr-error.ts"

/**
 * Thrown when a value the library produced itself breaks its own contract: a digest that is not a 32-byte id, a
 * primitive's key or signature of the wrong length, a brand whose value does not hold. It reports a broken primitive or
 * a bug, never anything a caller passed in.
 */
export class InvariantError extends NostrError {
  override readonly name: string = "InvariantError"
}
