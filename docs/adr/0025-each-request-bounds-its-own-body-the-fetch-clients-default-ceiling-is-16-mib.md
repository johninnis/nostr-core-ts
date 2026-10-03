# 0025. Each request bounds its own body; the fetch client's default ceiling is 16 MiB

## Status

Accepted

## Context

The URLs `createHttpClient` is handed are often chosen by someone else: a NIP-05 identifier names the domain whose `/.well-known/nostr.json` is fetched, a relay names its own NIP-11 endpoint, a Blossom server serves whatever bytes it holds. A body read without a bound lets any of them stream the client out of memory. An error body was already capped at 8 KiB for its message; a successful body was not.

The same client serves bodies of very different sizes. NIP-11 documents are a few kilobytes. A NIP-05 document is small when the server honours `?name=`, but many domains serve one static file listing every name, which runs to megabytes for a large community. NIP-86 replies list bans and allowed pubkeys; LNURL replies are small; Blossom blobs are as large as the media they hold, and a blob download usually knows the exact size to expect from the blob's descriptor. One ceiling for the whole client is either too loose for JSON or too tight for media, and a host that wants both would need two clients with no rule for which request goes to which.

## Decision

- `HttpRequest` carries an optional `maxBodyBytes`. A request that sets it is bounded by it; one that does not gets the implementation's default. The port states both the obligation and the default's purpose (JSON documents), so an in-memory client that ignores the field is still bounded by whatever its fixtures hold.
- `createHttpClient`'s default, `DEFAULT_MAX_BODY_BYTES`, is 16 MiB: large enough for the biggest JSON document the stack reads, small enough that a handful of hostile responses in flight cannot exhaust a browser tab. The client has no setting of its own for it: a request is the one place a ceiling is chosen.
- A declared `Content-Length` over the ceiling fails at once; otherwise the stream is read until it ends or passes the ceiling, and a body over it fails its reader with a `NetworkFailure` ("response body exceeds N bytes") without being buffered further.
- The NIP-05 and NIP-11 lookups never set `maxBodyBytes`: JSON documents take the default.

## Consequences

- A caller that forgets `maxBodyBytes` gets 16 MiB, not no bound. Only a caller that knows it needs more asks for more: `@innis/nostr-blossom` sizes a blob download from the expected size when it has one, and from its own larger bound when it does not.
- Lifting the ceiling is visible at the call site that needs it, instead of being a property of whichever client a host happened to wire in.
- The 8 KiB cap on an error body's message is separate and unchanged: it truncates, where this ceiling fails the read.
