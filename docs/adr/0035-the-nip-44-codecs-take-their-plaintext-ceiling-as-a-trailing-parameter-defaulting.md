# 0035. The NIP-44 codecs take their plaintext ceiling as a trailing parameter defaulting to 256 KiB

## Status

Accepted

## Context

Shared ADR-0102 decides that NIP-44 encryption and decryption apply a plaintext ceiling, 262144 bytes by default and raisable by the host up to the NIP's 4294967295, and that decryption refuses a payload longer than that ceiling's plaintext produces before reading it. innis/nostr-core holds the ceiling in its `Nip44Cipher` object, set when the cipher is constructed. The NIP-44 codecs here are two plain functions, `nip44Encrypt` and `nip44Decrypt`, with no object to hold a setting. Making them one, a cipher built with its ceiling, would add a second way to encrypt beside the functions every caller and `LocalSignerTools` already use.

A JavaScript string can also be a rope: a concatenation the engine keeps as two pieces until a character is read, when it copies the whole into one. Reading even the first character of a 400-million-character payload costs that copy, so the order of the checks decides whether the ceiling protects anything.

## Decision

- `nip44Encrypt(conversationKey, plaintext, maxPlaintextSize?)` and `nip44Decrypt(conversationKey, payload, maxPlaintextSize?)` take the ceiling as a third parameter. It defaults to `NIP44_DEFAULT_MAX_PLAINTEXT_SIZE`, 262144; a value that is not an integer from 1 to `NIP44_MAX_PLAINTEXT_SIZE` is misuse and throws `InvalidArgumentError`.
- The ceiling is applied in the codec, not the vendored file (ADR-0016). Encryption refuses an empty plaintext or one over it with `Nip44CryptoError`, the message naming the ceiling: `Plaintext length must be between 1 and <ceiling> bytes`. Decryption compares the payload's length with the base64 length of the payload a plaintext of the ceiling produces, before reading any character of it, so a long rope is refused without being copied; only then does the vendored file read the `#` flag and check the 132-character minimum, in that order (ADR-0016, divergence 8); it then refuses a decrypted plaintext over the ceiling.
- `defaultLocalSignerTools` call the codecs with the default. A host that needs more gives `createLocalSigner` tools whose `nip44Encrypt` and `nip44Decrypt` pass its ceiling.

## Consequences

- A caller that never thinks about size gets the shared default, and one that does states its ceiling at the call that needs it, with no cipher object to construct.
- A payload over the ceiling is reported as too long even when it starts with `#`: reading its first character is the cost the check exists to avoid. A `#` payload within the ceiling is reported as an unsupported version whatever its length, one shorter than 132 characters included, as shared ADR-0102 orders the checks: maximum length, then `#`, then minimum length.
- A gift wrap nests one NIP-44 payload inside another under the same ceiling: the seal's content is the rumour's payload, 4 × ⌈(65 + prefix + `calc_padded_len(n)`) / 3⌉ characters for a rumour of n bytes, and the seal is then encrypted whole. At the default, a rumour of 163840 bytes pads to 163840 and gives a 218548-character payload, which a seal holds with room to spare; the next padded length, 196608, gives 262240 characters, over 262144 before the seal adds anything. So `buildDmGiftWraps` carries a serialised rumour of at most `GIFT_WRAP_MAX_RUMOUR_SIZE`, 163840 UTF-8 bytes, and refuses a larger one before encrypting anything, returning the signer's own `SignerFailure`, unwrapped as ADR-0012 has every encrypting builder return it, of type `encrypt-failed` with a message naming that limit: the failure an oversized seal already returned. The limit holds whatever ceiling the signer applies: the builder cannot see it, and a recipient at the default could not open the wrap. innis/nostr-core's `GiftWrapper::MAX_RUMOUR_LENGTH` is the same 163840 (shared ADR-0102).
- Do not move the maximum-length check after a character read, such as the `#` check, to give an oversized `#` payload the version message. The protocol's order of the checks is shared ADR-0102's; what is this package's own is that the maximum is checked on the string's length alone, in the codec, so a rope is never flattened to be refused.
- Shared decision: nostr-adrs ADR-0102.
