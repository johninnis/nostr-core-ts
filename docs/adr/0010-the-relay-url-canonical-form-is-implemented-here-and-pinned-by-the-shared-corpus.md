# 0010. The relay-URL canonical form is implemented here and pinned by the shared corpus

## Status

Accepted

## Context

Relay URLs arrive from tags, NIP-19 hints, NIP-65 lists and user input in many spellings of the same relay. The canonical form, and the rule that the shared corpus is its specification, is the protocol decision of shared ADR-0002. What is this package's own is that it keeps its own implementation of that form although other implementations exist: `@innis/nostr-relay-selection` and the PHP `innis/nostr-relay-selection` each carry one because they are dependency-free, and the PHP nostr-core carries its own. Four copies of one non-trivial rule set look like duplication that should be collapsed into a shared dependency.

## Decision

`parseRelayUrl` implements shared ADR-0002 in this package's own code. `tests/types/relay-url-vectors.json` is a byte-for-byte copy of `@innis/nostr-relay-selection`'s `tests/corpus/normalise-url.json`, and the test suite runs every vector and checks every output is a fixed point. The relay-tag helpers compare `r` tags by that canonical form.

## Consequences

A rule change is a change to shared ADR-0002 and the corpus first, copied here; a change made here alone fails once the corpus is updated. Making `@innis/nostr-relay-selection` depend on this package to "deduplicate" the implementations is declined, because it would give the dependency-free package a dependency.

Shared decision: nostr-adrs ADR-0002.
