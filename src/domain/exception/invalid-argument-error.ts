import { NostrError } from "./nostr-error.ts"

/**
 * Thrown when a caller passes an argument outside a function's documented contract — metadata a builder cannot write, a
 * fixture that is not the value it names. A programmer error at the call site, not an answer about untrusted input,
 * which a parser returns instead.
 */
export class InvalidArgumentError extends NostrError {
  override readonly name: string = "InvalidArgumentError"
}
