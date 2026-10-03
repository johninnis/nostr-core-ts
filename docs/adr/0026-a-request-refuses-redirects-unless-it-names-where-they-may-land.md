# 0026. A request refuses redirects unless it names where they may land

## Status

Accepted

## Context

A NIP-05 identifier names the host whose `/.well-known/nostr.json` is fetched, and a relay URL names the host whose NIP-11 document is fetched: whoever publishes the identifier or the relay URL chooses where the client sends a request. A public URL that redirects to a private address, or to anywhere else, carries that choice one step further, and NIP-05 already says "Fetchers MUST ignore any HTTP redirects given by the `/.well-known/nostr.json` endpoint."

Refusing every redirect is not right for every request. Blossom's BUD-01 lets `GET /<sha256>` answer with a 307 or 308, and a server that uses it "MUST redirect to a URL containing the same sha256 hash as the requested blob" — the blob may be served from a CDN — so a client that refuses every redirect cannot download from such a server. Only the code making a request knows which protocol it speaks, so a client-wide switch is the wrong place for the choice.

## Decision

- `HttpRequest` carries `followRedirectTo?: (url) => boolean`. Omitted, a redirect — a 301, 302, 303, 307 or 308, the statuses `fetch` follows — is a `ServerFailure` with its status; any other 3xx, such as `304 Not Modified`, is not a redirect and is answered like any status below 400. Set, the redirect is followed and a landing URL the predicate rejects is a `NetworkFailure`, its answer discarded. `fetch` hides intermediate hops and, in a browser, the `Location` of a redirect it did not follow, so the landing URL is the one a client can judge.
- In a browser, `fetch` with `redirect: "manual"` answers a redirect with an opaque-redirect response (`type` `"opaqueredirect"`) whose `status` is `0` and whose headers are hidden. It is a redirect all the same: the client reads it by its type, so it is refused as a `ServerFailure` carrying that `status` `0` and the message `redirect refused`, with no `Location` to name. Deno and other server runtimes expose the real status and `Location`.
- The client has no switch of its own: the request is the one place the policy is set.
- The NIP-05 and NIP-11 lookups never follow a redirect.

## Consequences

- A followed redirect reaches its target before the client can judge it; the check after the fact keeps the answer from the caller but not the request from being sent. Only a request that opts into redirects, for a protocol that permits them, carries that exposure.
- A landing URL is also held to the client's private-address policy (ADR-0032).
