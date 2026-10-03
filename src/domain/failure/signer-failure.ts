/**
 * Returned (inside `Failure(...)`) by every `Signer` method. `type` names the mode: no signer is wired, the transport
 * disconnected, the user declined, the signer signed as a different key than the caller expected, or the public-key /
 * sign / decrypt / encrypt call otherwise failed. `message` carries the signer's own words, which callers show.
 */
export interface SignerFailure {
  readonly type:
    | "no-signer"
    | "disconnected"
    | "rejected"
    | "pubkey-mismatch"
    | "public-key-failed"
    | "sign-failed"
    | "decrypt-failed"
    | "encrypt-failed"
  readonly message: string
}
