import type { PublicKey } from "../value-object/public-key.ts"
import { TaggedError } from "./tagged-error.ts"

/** Thrown when a signer's actual public key does not match the public key the caller expected. */
export class PubkeyMismatchError extends TaggedError<"PubkeyMismatchError"> {
  readonly expected: PublicKey
  readonly actual: PublicKey
  constructor(expected: PublicKey, actual: PublicKey) {
    super("PubkeyMismatchError", `Signer pubkey ${actual} does not match expected pubkey ${expected}`)
    this.expected = expected
    this.actual = actual
  }
}
