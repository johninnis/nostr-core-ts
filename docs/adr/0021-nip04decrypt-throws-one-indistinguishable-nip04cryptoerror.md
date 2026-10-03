# 0021. `nip04Decrypt` throws one indistinguishable `Nip04CryptoError`

## Status

Accepted

## Context

Shared ADR-0018 decides that every payload NIP-04 decryption cannot decrypt is rejected with the one message `NIP-04 decryption failed` and no cause, and that a payload shorter than 52 or longer than 87472 characters is rejected before any decoding. NIP-04 has no MAC, so a message that named the part that failed — above all a padding failure — would tell whoever submitted the ciphertext whether their guess produced valid padding.

## Decision

`nip04Decrypt` throws `Nip04CryptoError` with that one message and no `cause` for every payload it cannot decrypt, a sender key off the curve and a plaintext that is not valid UTF-8 included (local ADR-0008, shared ADR-0100). The length bounds run first, the payload's base64 is read without a catch (ADR-0004), and only the AES-CBC step and the ECDH step are caught, each for its own refusal. `nip04Encrypt` keeps its descriptive `NIP-04 encryption failed`, carrying its cause. It refuses a plaintext over 65567 UTF-8 bytes, whose payload would pass the 87472-character ceiling, with `Nip04CryptoError` before any work, so a `Signer` reports it as `encrypt-failed`, as `nip44Encrypt` reports a plaintext over its ceiling (shared ADR-0018).

## Consequences

- A malformed NIP-04 payload is harder to debug; do not restore distinct messages.
- This does not close the padding oracle: valid padding decrypts to garbage and invalid padding throws, so "did it throw" remains the signal. Consumers exposing NIP-04 decryption to untrusted input should treat success versus failure as sensitive and move to NIP-44.
- Shared decisions: nostr-adrs ADR-0001, ADR-0018 and ADR-0100.
