# 0024. A zap address is parsed here and names its pay endpoint, which is not fetched here

## Status

Accepted

## Context

NIP-57's flow begins: "Client calculates a recipient's lnurl pay request url from the `zap` tag on the event being zapped (see Appendix G), or by decoding their lud16 field on their profile according to the [lnurl specifications](https://github.com/lnurl/luds)." Profiles also carry `lud06`, an LNURL, and the zap request's `lnurl` tag is "the lnurl pay url of the recipient, encoded using bech32 with the prefix `lnurl`". Appendix F says the receipt's `pubkey` "MUST be the same as the recipient's lnurl provider's `nostrPubkey`", which `verifyZapReceipt` checks against a key the caller supplies (ADR-0020).

The two address forms are defined outside the NIPs. LUD-01: "`LNURL` is a bech32-encoded HTTPS/Onion URL", "Bech32-encoded `LNURL`s can both be uppercase or lowercase, but not mixed case", and "`LNURL` is acceptable in two forms: either an `https://` clearnet link (no self-signed certificates allowed) or an `http://` v2/v3 onion link". LUD-16: "The `<username>` is limited to `a-z0-9-_.` (and `+` if the `SERVICE` supports tags)", and a wallet "makes a GET request to `https://<domain>/.well-known/lnurlp/<username>` endpoint if `domain` is clearnet or `http://<domain>/.well-known/lnurlp/<username>` if `domain` is onion".

ADR-0001 limits this package to behaviour a NIP specifies. Every client that zaps or verifies a receipt has to turn `lud06` / `lud16` into that URL, and an LNURL needs bech32, which this package already decodes for NIP-19.

## Decision

- `LightningAddress`, `Lnurl` and `ZapAddress` (their union) are brands here, beside `parseZapAddress` and `payEndpointUrl`. NIP-57 delegates to LUD-01 and LUD-16 for the step it names, so they count as the NIP's behaviour under ADR-0001.
- An LNURL is decoded by the same bech32 helper as NIP-19, bounded at NIP-19's 5000 characters rather than BIP-173's 90, which LNURLs routinely exceed. Mixed case is refused; either single case is accepted and the brand is lowercase.
- An LNURL whose decoded payload is not valid UTF-8 is not an `Lnurl`: it names no URL, and is refused through `decodeUtf8` rather than read with replacement characters (ADR-0004).
- LUD-01's scheme rule is enforced when parsing, so an `Lnurl` always names an `https` URL or an `http` onion URL. A Lightning address has the NIP-05 identifier's domain rules and whitespace rule, and LUD-16's username characters, `+` included. Its username needs no percent-encoding in the endpoint path: every allowed character is legal there, and LUD-16 writes the `+<tag>` literally.
- The brands live in `src/domain/service/zap-address.ts`, not `value-object/`, because the LNURL canonicaliser needs the bech32 service and value objects do not depend on services.
- Nothing here fetches the endpoint, as in ADR-0020: the caller brings its own HTTP client and reads `nostrPubkey` itself.

## Consequences

- A client needs no bech32 dependency of its own to zap or verify.
- An LNURL that encodes plain `http` off an onion host has no `ZapAddress`, and a zap to it is not offered.
- A tagged address (`name+tag@domain`) is a `LightningAddress` but not a `Nip05Id`, whose local part NIP-05 limits to `a-z0-9-_.`.
- A Lightning address whose LUD-16 pay URL, bech32-encoded under `lnurl`, would pass NIP-19's 5000 characters is not a `LightningAddress`: a zap request's `lnurl` tag could not name it, so `lnurlOf` is total over the brand.
- LUD-16's optional `@domain` shorthand is not accepted; LUD-16 says a wallet "MAY reject `@<domainname>` as an invalid internet identifier".
- Shared decisions: nostr-adrs ADR-0038 and ADR-0068.
