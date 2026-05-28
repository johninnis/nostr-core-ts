/**
 * Shared module-level `TextEncoder` and `TextDecoder` singletons. Safe to reuse because the
 * default (non-streaming, UTF-8) instances are stateless across `encode()`/`decode()` calls.
 *
 * Hoisted into one place so every UTF-8 boundary in the library — NIP-98 header construction,
 * bech32 TLV codec, SHA-256 input, NIP-04 plaintext bytes, HTTP error-body decode — shares the
 * same instance rather than allocating per call. Vendored crypto in `infrastructure/crypto/` is
 * the only exception (it inlines its own encoder to keep the file behaviour-preserving).
 */
export const textEncoder: TextEncoder = new TextEncoder()
export const textDecoder: TextDecoder = new TextDecoder()
