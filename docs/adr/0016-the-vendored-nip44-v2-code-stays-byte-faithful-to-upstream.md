# 0016. The vendored NIP-44 v2 code stays byte-faithful to upstream

## Status

Accepted

## Context

NIP-44 v2 is vendored from paulmillr/nip44, the audited reference implementation. Its ECDH step overlaps the `sharedX` helper used for NIP-04, which invites unifying them. Shared ADR-0019 decides that public NIP-44 encryption takes no caller-chosen nonce and that the specification vectors are reproduced through a seam production code cannot reach.

## Decision

`src/infrastructure/crypto/nip44-v2.ts` stays as close to upstream as the noble v2 import paths and type tightenings allow, lists each divergence in its header, and keeps its own ECDH step. The header numbers its divergences 1 to 8: 1 to 4 change no result upstream returns (noble v2's import paths and byte arguments, and a subarray offset upstream's dependencies never produce), and 5 to 8 change what it accepts or returns. Divergence 5 is the plaintext's reading: upstream's default `TextDecoder` strips a byte order mark and replaces invalid bytes, so the file reads the plaintext through `decodeUtf8` and throws a plain `Error` for bytes that are not UTF-8, as shared ADR-0100 requires (ADR-0004). Divergence 6 is NIP-44's extended length format, which the NIP added after upstream's latest commit: a plaintext of 65536 bytes or more, up to 4294967295, carries two zero bytes and a big-endian u32 in place of the u16 prefix, a zero u16 is read as announcing it, `pad` applies the NIP pseudocode's range check of 1 to 4294967295 bytes before it chooses a prefix, and the payload ceilings the u16 implied are dropped. The ceiling a host applies is not the vendored file's: the codec refuses an oversized payload before calling it and an oversized plaintext on either side of it (local ADR-0035, shared ADR-0102). It follows the NIP's pseudocode, as nostr-tools 2.25.2 does, and is pinned by the NIP's extended length prefix vectors; when upstream ships the format, the file is re-vendored from it and this divergence removed. Divergence 7 is the padding's bytes. NIP-44's decryption step 7 says "Verify that calculated padding from step 3 of the [encryption](#Encryption) process matches the actual padding", and upstream compares only the padding's length, so a payload whose MAC is valid but whose padding bytes are not zero decrypts. That reading leaves the two libraries disagreeing on what they accept, and innis/nostr-core refuses such a payload; the rule between them is that the PHP library's reading stands, so `unpad` refuses padding that is not the zero bytes `pad` writes, as `invalid padding` (shared ADR-0102). Divergence 8 is the order of `decodePayload`'s first checks: upstream checks the 132-character minimum before the `#` flag, so a short payload starting with `#` is reported as `invalid payload length`, where NIP-44 says a `#` payload "MUST indicate that the encryption version is not yet supported"; the file reads the flag first. The maximum length is checked before either, by the codec, on the string's length alone (local ADR-0035, shared ADR-0102). The codec around it converts only the vendored code's refusals into `Nip44CryptoError` (ADR-0008). The vendored `encrypt` keeps upstream's optional nonce, which is the seam shared ADR-0019 names: only the vector tests pass it, and the public `nip44Encrypt` takes no nonce.

## Consequences

The vendored file can be diffed against upstream and re-audited. `sharedX` is not routed into it, and the two ECDH steps stay separate. Validation and domain types belong in the codec, never in the vendored file.

Shared decisions: nostr-adrs ADR-0019 (the nonce seam), ADR-0100 (divergence 5) and ADR-0102 (divergences 6, 7 and 8).
