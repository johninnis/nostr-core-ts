/**
 * The root of every fault this library throws — `InvalidArgumentError`, `InvariantError`, `Nip04CryptoError` and
 * `Nip44CryptoError` — so a host can tell a fault raised by Nostr code from anything else that throws. Never thrown
 * itself.
 */
export abstract class NostrError extends Error {
  override readonly name: string = "NostrError"
}
