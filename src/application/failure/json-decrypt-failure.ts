import type { SignerFailure } from "../../domain/failure/signer-failure.ts"

/**
 * Returned (inside `Failure(...)`) when decrypting JSON over a `PeerCipher` fails: the ciphertext was empty, the
 * plaintext was not JSON, or the signer failed — the one mode that carries data, the `SignerFailure` the signer
 * returned. Any JSON is accepted, so a payload of the wrong shape is its reader's failure, not this one. Discriminate
 * on `type`. Encrypting JSON fails only when the signer does, so it returns the `SignerFailure` itself.
 */
export type JsonDecryptFailure =
  | { readonly type: "json-parse-failed" | "empty-ciphertext" }
  | { readonly type: "signer-failed"; readonly cause: SignerFailure }
