# 0038. The package names the kinds a NIP or a common standard defines, every one the PHP core names, and no application's private kind

## Status

Accepted

## Context

ADR-0001 limits this package to behaviour a NIP specifies, and leaves app-specific kind groupings to the consumer. hubstr-ssg's site kinds 30630–30632, which no NIP defines, were named in both cores, while the Marmot kinds (443–445, 10051) and Blossom's server list (10063) come from standards outside the NIP documents themselves that the NIP registry lists.

The rule was applied in both cores, but the two lists drifted: innis/nostr-core named 46 NIP-defined kinds this package did not, among them kind 9 (NIP-C7) and kind 1311 (NIP-53), which a reply now has to recognise. Neither core named the voice message kinds 1222 and 1244 (NIP-A0), which a reply also recognises, or NIP-29's group metadata, kind 39000, which the NIP-29 module reads (ADR-0040). A consumer reading a kind across the two languages found a constant in one and a bare number in the other.

## Decision

- `src/domain/value-object/kinds.ts` names a kind only when a NIP defines it, or another common standard defines it and the NIP registry lists it. Each constant's doc names the NIP or standard that defines it. An application's private kind is defined in that application.
- It names every kind innis/nostr-core's `EventKind` names, each under the name `EventKind` gives it in this package's `KIND_` form, and the two lists are kept equal: a kind added to one core is added to the other, under the same name, in the same change set. Where the two cores' names differed, the defining NIP's name won (innis/nostr-core ADR-0137): 10009 is `KIND_SIMPLE_GROUPS_LIST` (NIP-51's "Simple groups") and 31234 `KIND_DRAFT_WRAP` (NIP-37's "Draft Wraps"), both this package's names already.
- A test pins the kinds added to match the PHP core: 8, 9, 11, 15, 17, 20, 62, 1018, 1040, 1068, 1222, 1244, 1311, 4550, 7374, 7375, 7376, 9041, 10008, 10011, 10012, 10019, 10101, 10102, 10166, 10312, 13194, 17375, 23194, 23195, 30008, 30009, 30166, 30267, 30312, 30313, 30315, 30818, 30819, 31922, 31923, 31925, 31989, 31990, 34550, 38172, 38173, 39000 and 39092.

## Consequences

- The Marmot and Blossom kinds stay; hubstr-ssg's site kinds are not here and live in hubstr-ssg.
- A consumer finds the same kinds named in either language.
- A request to add a kind without a NIP or a registry-listed standard is declined here and belongs in the application that uses it.
- Shared decisions: nostr-adrs ADR-0012 and ADR-0109.
