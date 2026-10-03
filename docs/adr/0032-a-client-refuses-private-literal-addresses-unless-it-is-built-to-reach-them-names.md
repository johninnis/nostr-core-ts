# 0032. A client refuses private literal addresses unless it is built to reach them; names that resolve to one are the host's to police

## Status

Accepted

## Context

Whoever publishes a NIP-05 identifier or a relay URL chooses where the client sends a request, so an unguarded client can be pointed at the loopback interface, a home router, a cloud metadata endpoint or a service on the host's private network: server-side request forgery when the client runs on a server, and a request into the user's own network when it runs in a browser.

Two routes lead there without a redirect (ADR-0026). The URL can name a private address outright (`http://169.254.169.254/`, `http://[::1]/`, `http://localhost/`), which is visible in the URL. A public name can resolve to one, permanently or by rebinding between two lookups, which needs the resolved address — and `fetch`, in browsers and Deno alike, neither exposes it nor lets the caller pin the connection to an address it checked.

The refusal must not stop a user reaching their own relay on `localhost` or a media server on their LAN. Only the host knows who chose a URL. Passing that knowledge down as a per-request flag made every lookup that builds a request on its caller's behalf (NIP-11, each Blossom operation) take an options object only to forward it.

## Decision

- The policy belongs to the client, not to the request: `createHttpClient(privateAddresses?, fetch?)` takes a `PrivateAddressPolicy`, `"refuse-private"` by default or `"allow-private"`. A host holds the refusing client for targets someone else names (a NIP-05 domain, a relay or server from another user's event) and an allowing one for the targets its user chose (their relays, their media servers, an address they typed), and injects whichever fits into the lookup or library that makes the request.
- A client built with `"refuse-private"` refuses, with a `NetworkFailure` and without calling `fetch`, a URL whose host is `localhost` or a `.localhost` name (RFC 6761 reserves them for loopback) or a literal address in `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`, `fe80::/10`, `::`, `::1`, or an IPv6 address that carries one of those IPv4 addresses: IPv4-mapped (`::ffff:0:0/96`), IPv4-compatible (`::/96`), NAT64 (`64:ff9b::/96`, RFC 6052) or 6to4 (`2002::/16`, the IPv4 address in its second and third groups, RFC 3056), each of which a translator or relay router delivers to the IPv4 address inside it. The host is read after WHATWG URL parsing, so `http://0x7f.1/` is seen as `127.0.0.1`. A path with no host of its own (`/templates/page.html`) goes to the page's own origin, which the host chose, and is not checked; a scheme-relative `//host/` URL is checked like an absolute one. A followed redirect's landing URL is checked the same way once `fetch` returns, and its answer is discarded.
- `HttpRequest` has no private-address field, and no lookup takes one: `resolveNip05` and `fetchRelayInformation` reach a private address exactly when the client they are given does, because core cannot tell a relay from the user's own list or typed address from one named in someone else's event.
- A DNS name that resolves to a private address, DNS rebinding, and any other route that needs the resolved address remain the host's duty, discharged by the network it runs on (an egress proxy or firewall that refuses private ranges) or by an `HttpClient` of its own that resolves, checks and pins the address. The library states this obligation and does not attempt what `fetch` cannot see.

## Consequences

- A browser client using the shipped client cannot be steered at a literal private address or `localhost` by an identifier or relay URL it did not choose. A server host still needs egress controls: the literal check alone does not stop `internal.example` resolving to `10.0.0.5`.
- A host whose relay runs on `localhost` reaches it by passing its allowing client where it fetches that relay's document, not by weakening the client every other request goes through. Giving the allowing client to code that requests targets someone else named reopens the hole; that choice is the host's, made once where it wires its clients.
- Other special-use ranges (documentation `192.0.2.0/24`, benchmarking `198.18.0.0/15`, reserved `240.0.0.0/4`, multicast, and a NAT64 or 6to4 address carrying a public IPv4 address) are not refused: they are not private networks a request could be pointed into, multicast and `240.0.0.0/4` take no HTTP connection, and a host that needs them blocked blocks them at its egress. The scope is the private network, not every special-use range.
- The PHP nostr-core ships no HTTP client and leaves every one of these defences to the host (its ADR-0090); this package ships a client, so it takes the part a client can take without DNS.
