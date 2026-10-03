import type { SignerFailure } from "../failure/signer-failure.ts"
import type { NostrEvent, UnsignedEvent } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import type { Result } from "../value-object/result.ts"
import type { PeerCipher } from "./peer-cipher.ts"

/**
 * Discriminator identifying which signer implementation a `Signer` instance is.
 *
 * Exposed deliberately for UI surfaces: prompts like
 * "Confirm in your NIP-07 extension" vs "Confirm in your bunker"
 * vs "Sign with local key" need to know which kind is being asked.
 * Capability-based checks (`getPublicKey`, `signEvent`, etc.) cannot
 * express this distinction since all kinds share the same interface.
 */
export type SignerKind = "local" | "extension" | "bunker"

/**
 * The signing port every signer implementation satisfies — NIP-07, NIP-46 and `createLocalSigner` alike. Every method
 * returns a `Result`: a decline, a missing or disconnected signer, a signer that signed as another key, or a peer that
 * answered badly is a `Failure(SignerFailure)`, never a throw. A template that is not a NIP-01 event is the caller's
 * fault, not an outcome: every implementation runs it through `buildUnsignedEvent` before anything signs or is asked
 * to, so `signEvent` rejects with `InvalidArgumentError` the same way whichever signer it is.
 */
export interface Signer extends PeerCipher {
  readonly kind: SignerKind
  readonly getPublicKey: () => Promise<Result<PublicKey, SignerFailure>>
  readonly signEvent: (event: UnsignedEvent) => Promise<Result<NostrEvent, SignerFailure>>
}
