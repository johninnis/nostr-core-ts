# 0006. Brands parse untrusted input to a nullable value; `isValidX` checks canonical form

## Status

Accepted

## Context

`PublicKey`, `EventId`, `Sig`, `Nip05Id`, `RelayUrl`, `HttpUrl`, `AuthChallenge`, `SubscriptionId`, `Lnurl` and `LightningAddress` are branded strings so that hex, URL and challenge values cannot be confused at compile time. Earlier, each brand had a throwing `parseX`, a `tryParse` exposed for only some brands, and an `isValidX` guard that disagreed with `parseX`. Users were told to use the throwing parser at system boundaries — exactly where input is untrusted and failure is expected, so a throw was the wrong shape.

## Decision

Every brand is built from one canonicaliser by `createBrand({ canonicalise })` or `createHexBrand(length)`, which produce two functions. `parse(raw: unknown): T | null` canonicalises and returns the branded value, or `null`; it never throws. `is(raw): raw is T` is true exactly when `raw` is already canonical, that is when `parse(raw) === raw`. `parsePublicKey`, `parseEventId`, `parseSig`, `parseNip05Id`, `parseRelayUrl`, `parseHttpUrl`, `parseAuthChallenge`, `parseSubscriptionId`, `parseLnurl` and `parseLightningAddress` are the `parse`; `isValidPublicKey`, `isValidEventId`, `isValidSig`, `isValidNip05Id`, `isValidRelayUrl`, `isValidHttpUrl`, `isValidAuthChallenge`, `isValidSubscriptionId`, `isValidLnurl` and `isValidLightningAddress` are the `is`. `parseZapAddress` reads either zap address brand (ADR-0024). Parsing is the only way to brand, never `as PublicKey`. Where a library-internal value is known valid — a hash digest, a secp256k1 key — a `null` is a broken invariant and throws. Tests brand known-good literals with the throwing fixtures `publicKeyFixture`, `eventIdFixture`, `sigFixture`, `nip05IdFixture`, `relayUrlFixture`, `httpUrlFixture`, `authChallengeFixture`, `subscriptionIdFixture`, `lnurlFixture` and `lightningAddressFixture` from `@innis/nostr-core/testing`.

## Consequences

A hex brand's canonical form is its only form: `createHexBrand` accepts lowercase hex of the given length and nothing else, so upper-case hex parses to `null` (for a signature, shared ADR-0088). Lower-casing what a person typed is the job of the input edge that received it, not of a brand every protocol path shares.

`parse` canonicalises and then confirms the result is its own canonical form, so it runs the canonicaliser twice. That is deliberate: `createBrand` is public and brands defined downstream bring canonicalisers this package does not control, and a canonicaliser that is not idempotent would otherwise mint a brand whose value `is` rejects — a non-canonical `RelayUrl` that compares unequal to its own canonical form. The re-check turns such a bug into a `null` at the edge instead of a wrong value everywhere after it. Do not remove it to save the second pass; the cost is paid only where untrusted input enters.

There is no `Invalid*Error` for any brand and no `tryParse*`: callers handle `null` at the edge, and the type checker makes them. `RelayUrl` follows the same shape as the others — `parseRelayUrl` returns `RelayUrl | null` and `isValidRelayUrl` is true exactly for canonical input.

Shared decisions: nostr-adrs ADR-0025 and ADR-0088.
