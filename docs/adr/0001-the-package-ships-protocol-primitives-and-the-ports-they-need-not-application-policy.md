# 0001. The package ships protocol primitives and the ports they need, not application policy or a relay transport

## Status

Accepted

## Context

Every `@innis/*` package depends on this one, so whatever it contains is imposed on all of them. Application concerns — a DM cache, a NIP-05 refresh schedule, a relay pool, retry and backoff policy — are tempting to centralise because several consumers need something similar. But they encode one application's persistence layout and policy, and a second consumer then has to work around them.

Some protocol behaviour cannot be written without I/O: NIP-05 and NIP-11 read a JSON document over HTTP. A package that stated only the port for that I/O would leave every browser and Deno consumer to write the same `fetch` adapter, and with it the redirect, body-size and private-address defences each of them would get subtly wrong. A zap's LNURL endpoint is the exception that stays outside: this package parses the zap address into its pay endpoint, and the application fetches it (ADR-0020, ADR-0024).

## Decision

`@innis/nostr-core` contains behaviour a NIP specifies, the ports that behaviour runs through, and a default implementation of a port only where one obviously correct implementation exists:

- Protocol primitives: branded primitives, event builders and parsers, NIP-19, NIP-17 gift-wrap construction and unwrapping, NIP-98, NIP-05 resolution and a per-domain verifier, and the NIP-11 relay information fetch (`fetchRelayInformation`).
- Ports: `Signer`, `PeerCipher`, `HttpClient` and `Nip98ReplayGuard`.
- Default implementations: the local signer over an in-memory key, and `createHttpClient`, the `fetch`-backed `HttpClient`, with each request's body ceiling (ADR-0025), redirect policy (ADR-0026) and private-address policy (ADR-0032).

It contains no relay transport and opens no socket: relay connections, pools, relay selection and event stores live in their own packages. DM caches, subscription services, refresh staleness policy, signer-selection UX and app-specific kind groupings belong to the consumer.

## Consequences

Consumers compose their own routing and storage instead of inheriting one, and any consumer can replace the shipped HTTP client with its own `HttpClient`. A request for a cache, a refresher, a subscription helper or a WebSocket transport is declined here and belongs in the consuming application or a dedicated package. The core stays small enough to reason about as a contract layer.
