# 0047. A Blossom authorisation header has its own encoder and parser beside the NIP-98 pair, and its own length bound

## Status

Accepted

Supersedes ADR-0039. Carried forward unchanged: `encodeBlossomAuthHeader` and `parseBlossomAuthHeader` are a second pair beside the NIP-98 `encodeAuthHeader` and `parseAuthHeader`; a Blossom header is written in canonical unpadded base64url and read in that or in canonical padded standard base64, any other spelling refused as `header-bad-base64`; both parsers run one private pipeline and both encoders share one length check; the failure vocabulary stays `AuthHeaderDecodeFailure`; `parseAuthHeader` never reads base64url. Revised: a Blossom header has its own length bound, 8000 characters, applied on writing and on reading (shared ADR-0106), where ADR-0039 bounded it at NIP-98's 4096 characters. This record holds the complete current decision.

## Context

`encodeAuthHeader` and `parseAuthHeader` wrote and read the `Authorization: Nostr <credentials>` header as one wire format for two protocols, NIP-98 and Blossom, its credentials in canonical padded standard base64 only (ADR-0004). BUD-11 now says a Blossom token "MUST be encoded as Base64 URL-safe without padding (Base64url, as used by JWTs)", while NIP-98 keeps standard base64. `parseAuthHeader` therefore refuses every BUD-11 client, and `encodeAuthHeader` writes a Blossom token in a form BUD-11 no longer specifies. Shared ADR-0111 decides the wire rule: a Blossom header is written in canonical unpadded base64url and read in that or in canonical padded standard base64, the form every Blossom client wrote before BUD-11; NIP-98 is unchanged. BUD-11's own example decodes in its form, but its payload carries `//` comments, so it is not JSON and is refused as such.

A Blossom token grows with the blobs it names: each `x` tag adds about 97 characters to the encoded header, so under NIP-98's 4096 characters a token naming more than about 36 blobs did not fit, and a client deleting or authorising a batch had to split it. Common HTTP servers refuse a single header line past about 8 KiB. Shared ADR-0106 bounds a Blossom header at 8000 characters, within that line, which fits a token naming about 80 blobs; NIP-98's event is fixed in size by one URL, and its bound stays 4096. ADR-0039 bounded both headers at 4096 characters.

Three shapes were weighed for the second pair:

- An options argument on `encodeAuthHeader` and `parseAuthHeader` naming the protocol. Every caller knows its protocol when it is written, so the option is a runtime choice no caller makes at run time, and a default would quietly pick one protocol for a caller that never said which.
- A separate Blossom module. It would repeat the scheme check, the length bound, the JSON reading and the failure vocabulary, or need a third module holding them, for a difference of one step and one bound.
- Two more functions beside the pair, in the module that already names the header family rather than a protocol.

## Decision

- `encodeBlossomAuthHeader(event): string | null` writes the credentials as canonical unpadded base64url, and returns `null` past 8000 characters, the bound `parseBlossomAuthHeader` applies.
- `parseBlossomAuthHeader(header): Result<NostrEvent, AuthHeaderDecodeFailure>` refuses a header longer than 8000 characters as `header-too-long`, reads canonical unpadded base64url or canonical padded standard base64, and refuses any other spelling as `header-bad-base64`.
- `encodeAuthHeader` and `parseAuthHeader` stay the NIP-98 pair, bounded at 4096 characters.
- Both parsers run one private pipeline (length, scheme token per shared ADR-0023, base64, UTF-8, JSON, event) given the base64 reader and the bound; both encoders share one length check given the bound. The canonical readers are `decodeBase64` and `decodeBase64UrlUnpadded`, each of which admits by pattern only the canonical text of its form, every string of which `@scure/base` decodes without throwing (ADR-0004); `base64urlnopad.encode` writes the second.
- The failure vocabulary stays `AuthHeaderDecodeFailure`, already neutral between the two protocols.

## Consequences

- A Blossom server calls `parseBlossomAuthHeader`, and a Blossom client calls `encodeBlossomAuthHeader`. A Blossom server calling `parseAuthHeader` refuses every BUD-11 client, and every token longer than 4096 characters.
- A server in front of this package must accept an 8 KiB header line for Blossom batches to reach it. A batch of more than about 80 blobs is still written as several tokens.
- Do not fold the pairs into one function with a protocol option, and do not make `parseAuthHeader` read base64url: a NIP-98 header is read only in its canonical padded form.
- Do not give the two schemes one bound: a NIP-98 event's size is fixed, while a Blossom token grows with the blobs it names.
- `tests/auth/blossom-auth-header-vectors.json` is byte-identical to innis/nostr-core's copy; a change to one is a change to both.
- Shared decisions: nostr-adrs ADR-0023, ADR-0106 and ADR-0111.
