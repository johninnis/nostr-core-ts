# 0005. `isRecord` and the array guards are public; scalar guards stay internal

## Status

Accepted

## Context

This package's public surface is Nostr protocol primitives (ADR-0001), and a generic JavaScript type guard such as `isRecord` looks out of place there — the kind of export a reviewer trims as scope creep, or, going the other way, rounds out by exporting every guard the package has. But every consumer narrows `unknown` JSON from relays, NIP-05 and NIP-11 documents, and the composite checks are where hand-written versions go wrong: `typeof value === "object" && value !== null && !Array.isArray(value)` is three traps in one line, and an "array of X" check is easy to get subtly wrong. Scalar checks such as `typeof value === "string"` have one obvious inline form.

## Decision

`isRecord`, `isArrayOf`, `isStringArray` and `isNumberArray` are public. `isString`, `isNumber` and `isNonNegativeInteger` stay internal: the first two are synonyms for an inline `typeof`, used point-free inside the package; `isNonNegativeInteger` is the shared event-field rule behind `parseNostrEvent` and rumour and seal parsing. An internal guard with no caller is deleted rather than kept for a caller that might come.

## Consequences

Consumers narrow Nostr JSON with the same composite guards the package uses, instead of re-implementing them. Removing them as off-topic would push the error-prone versions back into every consumer; exporting the scalar guards would add a second idiom for a check that already has one.
