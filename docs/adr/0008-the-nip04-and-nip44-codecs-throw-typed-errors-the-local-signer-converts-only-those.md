# 0008. The NIP-04 and NIP-44 codecs throw typed errors; the local signer converts only those

## Status

Accepted

## Context

Encryption and decryption are multi-step operations whose failure midway is a fault of that operation. The vendored NIP-44 code throws plain `Error`s, and the secp256k1 ECDH step under both ciphers throws a plain `Error` when the peer's key is not a curve point — which about half of all 32-byte values are, so a `PublicKey` read from a tag can name no key at all. The `Signer` port, in contrast, returns results for crypto (ADR-0002), so the local signer must turn a codec's refusal into a `SignerFailure` somewhere.

Catching every throw at that point looks like the safe way to honour the port. It is not: it converts a programmer error in a tool — a `TypeError` from a bug, a broken primitive — into `encrypt-failed` or `decrypt-failed`, an outcome the caller reports as "could not decrypt this message", and the bug is never seen. The same holds one step lower: a codec that rethrew every throw as its own error would hand the signer a disguised `TypeError` it could no longer tell from a refusal.

## Decision

- Each codec throws one typed error for everything it refuses, in both directions: `nip04Encrypt` and `nip04Decrypt` throw `Nip04CryptoError` (decryption with the one message of ADR-0021), and `nip44Encrypt`, `nip44Decrypt` and `getNip44ConversationKey` throw `Nip44CryptoError`. A peer key that is not a curve point is refused by the codec that uses it, with its error.
- A refusal is what the vendored NIP-44 code and the noble primitives throw for a payload or peer key they will not process — a bad MAC, padding, version, length or base64, a plaintext outside NIP-44's sizes, a point off the curve — and they throw it as a plain `Error`. Only a plain `Error` becomes the codec's error; anything else a step throws, such as a `TypeError` from a bug, propagates unchanged.
- The caller's own keys are checked before any step runs, and a malformed one is misuse that throws `InvalidArgumentError`: a secret key that is not 32 bytes holding a secp256k1 scalar from 1 to n − 1, a conversation key that is not 32 bytes, or a peer key that is not a `PublicKey` (64 lowercase hex characters). The noble primitives throw a plain `Error` for some of these (a 31-byte secret key is `Field.fromBytes: expected 32 bytes`), indistinguishable from a refusal, so the check cannot be left to them: without it, a caller's wrong-length key would come back as `decrypt-failed`. The NIP-44 test vectors that give an out-of-range `sec1` are this misuse; those that give a bad `pub2` are refusals.
- `createLocalSigner` catches exactly `Nip04CryptoError` and `Nip44CryptoError` and returns `Failure(SignerFailure)` with `encrypt-failed` or `decrypt-failed`. Anything else a tool throws, `InvalidArgumentError` included, propagates as a rejected promise.

## Consequences

- Callers of `Signer.nip04*` / `nip44*` never see the codec errors; direct callers of the codecs do.
- A `LocalSignerTools` replacement reports a payload or key it cannot use by throwing the codec's error; a tool that throws anything else is reporting a fault, and the host's unhandled-rejection handling sees it.
- Do not widen the signer's catch, or a codec's, to every throw to "never reject": that is the shape this record removes. The classes are not renamed to `*DecryptError`, because each covers both directions.
- This is the edge-catch rule of ADR-0034 applied to the codecs: each catch converts only the refusal of the library it wraps.
- Shared decisions: nostr-adrs ADR-0001 and ADR-0088.
