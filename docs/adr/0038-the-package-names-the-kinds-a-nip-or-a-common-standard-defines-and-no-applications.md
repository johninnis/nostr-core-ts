# 0038. The package names the kinds a NIP or a common standard defines, and no application's private kind

## Status

Accepted

## Context

ADR-0001 limits this package to behaviour a NIP specifies, and leaves app-specific kind groupings to the consumer. It did not say which single kinds this package may name. hubstr-ssg's site kinds 30630–30632, which no NIP defines, were named in both cores, while the Marmot kinds (443–445, 10051) and Blossom's server list (10063) come from standards outside the NIP documents themselves that the NIP registry lists.

## Decision

`src/domain/value-object/kinds.ts` names a kind only when a NIP defines it, or another common standard defines it and the NIP registry lists it. Each constant's doc names the NIP or standard that defines it. An application's private kind is defined in that application.

## Consequences

- The Marmot and Blossom kinds stay; hubstr-ssg's site kinds are not here and live in hubstr-ssg.
- A request to add a kind without a NIP or a registry-listed standard is declined here and belongs in the application that uses it.
- Shared decision: nostr-adrs ADR-0109.
