# 0048. `deletionCovers` is the one judgement of what a deletion request deletes, and a store finds the requests to judge by filter

## Status

Accepted

## Context

The package built deletion requests (`buildDeletion`) and gave the pieces a cache applies one with (`parseAddressableRef`, `buildAddressableEventFilter`), but left the judgement, which events a request deletes, to each caller. Each client that applied deletions wrote it again, and each got a different part wrong. ADR-0001 keeps application policy out of this package, which makes a judgement here look out of place. What a request deletes is protocol behaviour every party must answer identically (shared ADR-0124, ADR-0127), not policy: what a client then does with a deleted event, hiding, marking or removing it, is the policy, and stays with the caller.

A party also has to apply a request to an event that arrives after it (shared ADR-0126), so for each arriving event it has to find the requests it holds that could delete it. A relay holds its requests in a store it can query in the same write, and needs only a description of what to fetch. A browser client often cannot query its store as an event arrives, and keeps its requests in memory instead. The obvious move is to ship that in-memory index here too, since two clients need one. It is left out: which requests a party holds, where it loads them from, how long it keeps them and what memory it spends on them are decisions about the application's state, not about the protocol, and they differ between the clients that hold one.

## Decision

- `deletionCovers(deletion, target)` is the package's one statement of shared ADR-0124 with ADR-0093: pure, total, reading both events as given. The gift-wrap reach of an `e` tag (shared ADR-0123) is part of it, not an option, because every party applies it.
- `deletedCoordinates(deletion)` gives a request's own valid coordinates, for a caller that applies the request to a store by coordinate.
- `buildDeletionLookupFilters(target)` gives the NIP-01 filters that select every request that could delete `target`, for a party that holds its requests in a store: it fetches with them and judges each request found with `deletionCovers`.
- Holding requests is the caller's. The package offers no index, cache or store of deletion requests; a client that keeps them in memory files them as it chooses and judges each candidate with `deletionCovers`.
- The rule is pinned by the shared corpus, `tests/event/deletion-vectors.json`, which this package owns (shared ADR-0127); the judgement and the lookup filters each run it.

## Consequences

- A client and a relay give the same answer for the same pair of events, and a change to the rule is made here and in the corpus, not in each caller.
- The lookup filters may select a request `deletionCovers` then refuses; never treat a request found as a request that deletes.
- Each client that keeps requests in memory writes its own index. That code files requests and looks them up; it never decides what a request deletes, so it cannot drift from the rule.
- Shared decisions: nostr-adrs ADR-0093, ADR-0123, ADR-0124, ADR-0126 and ADR-0127.
