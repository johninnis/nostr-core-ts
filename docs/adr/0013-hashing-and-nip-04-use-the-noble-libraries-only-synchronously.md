# 0013. Hashing and NIP-04 use the noble libraries only, synchronously

## Status

Accepted

## Context

SHA-256 and NIP-04's AES-CBC used WebCrypto when present and fell back to `@noble/*` otherwise. WebCrypto is asynchronous and missing in insecure browser contexts, so the dual path made `computeEventId`, `verifyEventSignature`, `sha256Hex`, `buildRumour`, `parseRumour` and `buildNip98AuthEvent` asynchronous, needed a per-call test seam, and meant two implementations to trust. Filter hashing already used noble synchronously.

## Decision

All hashing and NIP-04 AES-CBC use `@noble/hashes` and `@noble/ciphers` directly and synchronously. `sha256Hex`, `computeEventId`, `verifyEventSignature`, `buildRumour`, `parseRumour`, `buildNip98AuthEvent`, `nip04Encrypt` and `nip04Decrypt` are synchronous, and `LocalSignerTools.nip04Encrypt` / `nip04Decrypt` return `string`.

## Consequences

One implementation, identical in every runtime, with no availability check. Hashing blocks the thread for its duration; nothing in this package hashes more than an event or a request body.
