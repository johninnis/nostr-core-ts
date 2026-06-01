import type { PublicKey } from "../value-object/public-key.ts"
import type { Result } from "../value-object/result.ts"
import type { SignerError } from "../exception/signer-error.ts"

/**
 * The peer-addressed encryption capability shared by every `Signer`: NIP-04 and NIP-44
 * encrypt/decrypt against a counterparty `pubkey`, each returning a `Result` (per-message crypto
 * is an expected-failure mode — see {@link Signer}). Helpers that only need to encrypt or decrypt —
 * not sign events or fetch keys — depend on this narrow port instead of the full `Signer`, so a
 * JSON codec is not coupled to `signEvent`. `Signer extends PeerCipher`, so any `Signer` satisfies it.
 */
export interface PeerCipher {
  readonly nip04Encrypt: (pubkey: PublicKey, plaintext: string) => Promise<Result<string, SignerError>>
  readonly nip04Decrypt: (pubkey: PublicKey, ciphertext: string) => Promise<Result<string, SignerError>>
  readonly nip44Encrypt: (pubkey: PublicKey, plaintext: string) => Promise<Result<string, SignerError>>
  readonly nip44Decrypt: (pubkey: PublicKey, ciphertext: string) => Promise<Result<string, SignerError>>
}
