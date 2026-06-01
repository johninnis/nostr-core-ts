import type { NostrEvent, UnsignedEvent } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"
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
 * Two error conventions coexist deliberately. **`getPublicKey` and `signEvent` throw**;
 * **`nip04*` and `nip44*` return `Result`**. The split maps to the two semantic categories:
 *
 *   - **Rare-exceptional** (throws): a local signer's `getPublicKey` literally cannot fail;
 *     NIP-07 / NIP-46 signers throw on transport blips or user rejection. Forcing Result on
 *     every caller buys nothing for the common case.
 *   - **Expected-failure-mode** (Result): per-message crypto operations fail often enough that
 *     a structured `SignerError` discriminator is worth the call-site verbosity (locked key,
 *     peer-pubkey rejected, NIP-04 not supported, etc.).
 *
 * See README §"Design conventions → Signer interface: throw vs Result". Don't propose unifying.
 */
export interface Signer extends PeerCipher {
  readonly kind: SignerKind
  readonly getPublicKey: () => Promise<PublicKey>
  readonly signEvent: (event: UnsignedEvent) => Promise<NostrEvent>
}
