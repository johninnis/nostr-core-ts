import type { PublicKey } from "../value-object/public-key.ts"
import type { Result } from "../value-object/result.ts"
import type { SignerFailure } from "../failure/signer-failure.ts"

/**
 * One peer-addressed cipher operation: encrypt or decrypt `text` for or from `pubkey`, returning the result or a
 * `SignerFailure`.
 */
export type PeerCipherFn = (pubkey: PublicKey, text: string) => Promise<Result<string, SignerFailure>>

/**
 * The peer-addressed encryption capability shared by every `Signer`: NIP-04 and NIP-44 encrypt/decrypt against a
 * counterparty `pubkey`. Code that only encrypts or decrypts — not signs or reads its own key — depends on this narrow
 * port instead of the full `Signer`, and any `Signer` satisfies it.
 */
export interface PeerCipher {
  readonly nip04Encrypt: PeerCipherFn
  readonly nip04Decrypt: PeerCipherFn
  readonly nip44Encrypt: PeerCipherFn
  readonly nip44Decrypt: PeerCipherFn
}
