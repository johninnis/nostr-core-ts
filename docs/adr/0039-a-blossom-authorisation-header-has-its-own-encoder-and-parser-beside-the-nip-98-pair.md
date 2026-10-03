# 0039. A Blossom authorisation header has its own encoder and parser beside the NIP-98 pair

## Status

Accepted

## Context

`encodeAuthHeader` and `parseAuthHeader` wrote and read the `Authorization: Nostr <credentials>` header as one wire format for two protocols, NIP-98 and Blossom, its credentials in canonical padded standard base64 only (ADR-0004). BUD-11 now says a Blossom token "MUST be encoded as Base64 URL-safe without padding (Base64url, as used by JWTs)", while NIP-98 keeps standard base64. `parseAuthHeader` therefore refuses every BUD-11 client, BUD-11's own example among them, and `encodeAuthHeader` writes a Blossom token in a form BUD-11 no longer specifies. Shared ADR-0111 decides the wire rule: a Blossom header is written in canonical unpadded base64url and read in that or in canonical padded standard base64, the form every Blossom client wrote before BUD-11; NIP-98 is unchanged.

Three shapes were weighed:

- An options argument on `encodeAuthHeader` and `parseAuthHeader` naming the protocol. Every caller knows its protocol when it is written, so the option is a runtime choice no caller makes at run time, and a default would quietly pick one protocol for a caller that never said which.
- A separate Blossom module. It would repeat the scheme check, the length bound, the JSON reading and the failure vocabulary, or need a third module holding them, for a difference of one step.
- Two more functions beside the pair, in the module that already names the header family rather than a protocol.

## Decision

- `encodeBlossomAuthHeader(event): string | null` writes the credentials as canonical unpadded base64url, and returns `null` past 4096 characters, as `encodeAuthHeader` does (shared ADR-0106).
- `parseBlossomAuthHeader(header): Result<NostrEvent, AuthHeaderDecodeFailure>` reads canonical unpadded base64url, or canonical padded standard base64, and refuses any other spelling as `header-bad-base64`.
- `encodeAuthHeader` and `parseAuthHeader` stay the NIP-98 pair, unchanged.
- Both parsers run one private pipeline (length, scheme token per shared ADR-0023, base64, UTF-8, JSON, event) given the base64 reader; both encoders share one length check. The canonical readers are `decodeBase64` and `decodeBase64UrlUnpadded`, each of which admits by pattern only the canonical text of its form, every string of which `@scure/base` decodes without throwing (ADR-0004); `base64urlnopad.encode` writes the second.
- The failure vocabulary stays `AuthHeaderDecodeFailure`, already neutral between the two protocols.

## Consequences

- A Blossom server calls `parseBlossomAuthHeader`, and a Blossom client calls `encodeBlossomAuthHeader`. A Blossom server calling `parseAuthHeader` refuses every BUD-11 client.
- Do not fold the pairs into one function with a protocol option, and do not make `parseAuthHeader` read base64url: a NIP-98 header is read only in its canonical padded form.
- `tests/auth/blossom-auth-header-vectors.json` is byte-identical to innis/nostr-core's copy; a change to one is a change to both.
- Shared decision: nostr-adrs ADR-0111.
