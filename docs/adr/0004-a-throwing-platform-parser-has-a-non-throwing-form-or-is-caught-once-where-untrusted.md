# 0004. A throwing platform parser has a non-throwing form, or is caught once where untrusted input is first read

## Status

Accepted

## Context

Domain and application code do not catch exceptions: a fault should reach the process boundary, and an expected failure should be a returned value the type checker forces callers to handle. But a few platform and library functions signal malformed input only by throwing.

## Decision

- Where a non-throwing form exists it is used: `URL.parse` for URLs, `bech32.decodeUnsafe` and `bech32.fromWordsUnsafe` for bech32.
- Where a check can decide in advance exactly what a throwing function accepts, the check is the non-throwing form: `decodeBase64` admits only canonical padded base64, every string of which the decoder accepts, and returns `null` for anything else; it serves the NIP-98 `Authorization` header and the NIP-04 payload (shared ADR-0095).
- Where the function is total over what the types admit, nothing is caught: `schnorr.verify` returns `false` for a key off the curve or a signature out of range, and the brands guarantee the lengths it would otherwise throw on, so `verifyEventSignature` is a total predicate (shared ADR-0017) with no conversion.
- `JSON.parse` has none of these, and is wrapped once: `parseJson` returns `Result<unknown, JsonParseFailure>` (`"malformed-json"`; JSON `null` is a valid value, so `null` cannot mean "malformed"), and also returns `malformed-json` for a text holding an unpaired surrogate, which `JSON.parse` accepts (shared ADR-0104). Its catch has the one shape `innis/no-catch-in-layer` permits in an inner layer, `try { return ok(JSON.parse(text)) } catch { return failure("malformed-json") }`: the try returns a single call's value and the catch only returns the failure, so no exemption is needed.
- A fatal `TextDecoder` has none of them either, and is wrapped once in the same shape: `decodeUtf8` returns `null` for bytes that are not valid UTF-8, keeping a byte order mark as written. It is the one reader of untrusted bytes as text, and each reader turns `null` into its own refusal, never a lossy decoding whose replacement characters or stripped byte order mark change what was written:
  - the NIP-98 `Authorization` header's credentials, after the scheme token (shared ADR-0023) and the canonical base64 (shared ADR-0095): bytes that are not UTF-8 are `header-bad-json`, as innis/nostr-core's JSON decoder refuses them;
  - a NIP-19 relay record, which without a UTF-8 reading has no canonical relay URL and is dropped as any other hint without one (shared ADR-0084, shared ADR-0094);
  - an `naddr`'s `special` identifier, which when not UTF-8 refuses the entity (shared ADR-0094);
  - an LNURL's decoded bech32 payload, which when not UTF-8 is not an `Lnurl` (ADR-0024);
  - an HTTP body read through `HttpResponse.json()`, which when not UTF-8 is a `MalformedBodyFailure` as a body that is not JSON is; the lossy `textDecoder` reads only display text, a body read through `text()` and an error body's message;
  - the plaintext `nip04Decrypt` and `nip44Decrypt` recover, which when not UTF-8 is the codec's decryption refusal, `Nip04CryptoError` or `Nip44CryptoError`, and `decrypt-failed` from a `Signer` (shared ADR-0100). The vendored NIP-44 file reads it through `decodeUtf8` as a listed divergence (ADR-0016).
- These two catches are the only such conversions in the inner layers.

## Consequences

Code that needs JSON calls `parseJson` rather than adding another catch, and a new dependency's non-throwing form, or a check that decides its input in advance, is preferred over wrapping its throwing form. A caught value is always an anticipated malformed-input outcome, never a broken invariant. `JSON.stringify` is not caught: it serialises the library's own values, and one it cannot serialise (a cycle, a `BigInt`) is a programmer fault that throws. A brand-violating value handed to `verifyEventSignature` through an untyped path throws, as any broken invariant does.

Shared decisions: nostr-adrs ADR-0017, ADR-0023, ADR-0084, ADR-0094, ADR-0095, ADR-0100 and ADR-0104.
