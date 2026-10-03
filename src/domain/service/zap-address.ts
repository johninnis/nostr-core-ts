import type { Brand, BrandTools } from "../value-object/brand.ts"
import { createBrand } from "../value-object/brand.ts"
import { trimUnicodeWhitespace } from "../value-object/trim.ts"
import { canonicaliseInternetIdentifier, splitInternetIdentifier } from "../value-object/internet-identifier.ts"
import { decodeBech32, encodeBech32Bounded } from "./bech32.ts"
import { decodeUtf8, textEncoder } from "./text-codec.ts"
import { InvariantError } from "../exception/invariant-error.ts"

declare const lnurlBrand: unique symbol
declare const lightningAddressBrand: unique symbol

/**
 * Branded LUD-01 LNURL: the bech32 encoding, under the `lnurl` prefix, of a service's URL; lowercased. Construct via
 * `parseLnurl`.
 */
type Lnurl = Brand<typeof lnurlBrand>

/**
 * Branded LUD-16 Lightning address, `username@domain`: a username of `a-z0-9-_.+` as written, and a lower-cased domain.
 * Construct via `parseLightningAddress`.
 */
type LightningAddress = Brand<typeof lightningAddressBrand>

/** Where a NIP-57 zap recipient's LNURL-pay endpoint is found: a `lud16` Lightning address or a `lud06` LNURL. */
type ZapAddress = LightningAddress | Lnurl

const LNURL_PREFIX = "lnurl"
const ONION_SUFFIX = ".onion"
const USERNAME_REGEX = /^[a-z0-9._+-]+$/

const isOnion = (hostname: string): boolean => hostname.endsWith(ONION_SUFFIX)

const decodedUrl = (bech32Text: string): URL | null => {
  const decoded = decodeBech32(bech32Text)
  const text = decoded?.hrp === LNURL_PREFIX ? decodeUtf8(decoded.bytes) : null
  return text === null ? null : URL.parse(text)
}

const isServiceUrl = (url: URL): boolean =>
  url.protocol === "https:" || (url.protocol === "http:" && isOnion(url.hostname))

const lnurlTools: BrandTools<Lnurl> = createBrand({
  canonicalise: (raw) => {
    const trimmed = trimUnicodeWhitespace(raw)
    const url = decodedUrl(trimmed)
    return url !== null && isServiceUrl(url) ? trimmed.toLowerCase() : null
  },
})

const lightningAddressUrl = (address: string): string => {
  const { name, domain } = splitInternetIdentifier(address)
  const scheme = isOnion(domain) ? "http" : "https"
  return `${scheme}://${domain}/.well-known/lnurlp/${name}`
}

const encodedPayUrl = (address: string): string | null =>
  encodeBech32Bounded(LNURL_PREFIX, textEncoder.encode(lightningAddressUrl(address)))

const lightningAddressTools: BrandTools<LightningAddress> = createBrand({
  canonicalise: (raw) => {
    const address = canonicaliseInternetIdentifier(raw, USERNAME_REGEX)
    return address !== null && encodedPayUrl(address) !== null ? address : null
  },
})

/**
 * Parse untrusted input as an `Lnurl`, or `null`: it must be bech32 under the `lnurl` prefix, all upper or all lower
 * case, encoding as valid UTF-8 an `https` URL or an `http` URL on an onion host (LUD-01). Whitespace around it is
 * trimmed by the set a Lightning address is trimmed by (shared ADR-0068).
 */
export const parseLnurl = lnurlTools.parse
/** Type guard: `true` only for an LNURL already in canonical form (lowercase, no surrounding space). */
export const isValidLnurl = lnurlTools.is

/**
 * Parse untrusted input as a `LightningAddress`, or `null` when it is not one. The username must already be
 * `a-z0-9-_.`, with `+` for a tag (LUD-16), and is never rewritten; the domain is lower-cased and must be a DNS name of
 * two or more labels whose last label is not numeric. Whitespace around the whole input is trimmed; whitespace inside
 * it is refused. The `@domain` shorthand, which LUD-16 lets a wallet reject, is refused, and so is an address whose
 * LUD-16 pay URL would not fit an `Lnurl` of NIP-19's 5000 characters, which a zap request could not name.
 */
export const parseLightningAddress = lightningAddressTools.parse
/**
 * Type guard: `true` only for a Lightning address already in canonical form (lower-case domain, no surrounding space).
 */
export const isValidLightningAddress = lightningAddressTools.is

/** Parse untrusted input as a Lightning address or else an LNURL, or `null` when it is neither. */
export const parseZapAddress = (raw: unknown): ZapAddress | null => parseLightningAddress(raw) ?? parseLnurl(raw)

const lnurlServiceUrl = (lnurl: Lnurl): string => {
  const url = decodedUrl(lnurl)
  if (url === null) throw new InvariantError(`${lnurl} is branded an Lnurl but does not decode to a URL`)
  return url.href
}

/**
 * The URL of the recipient's LNURL-pay endpoint: a Lightning address's LUD-16 well-known path (`http` on an onion
 * domain, otherwise `https`), or the URL an LNURL encodes.
 */
export const payEndpointUrl = (address: ZapAddress): string =>
  isValidLightningAddress(address) ? lightningAddressUrl(address) : lnurlServiceUrl(address)

/**
 * The LUD-01 `Lnurl` naming `address`'s pay endpoint, for a zap request's `lnurl` tag: an `Lnurl` as it is, or a
 * Lightning address's LUD-16 URL bech32-encoded under `lnurl` (NIP-57 Appendix B: "The recipient's lightning address,
 * encoded as a lnurl").
 */
export const lnurlOf = (address: ZapAddress): Lnurl => {
  if (!isValidLightningAddress(address)) return address
  const encoded = encodedPayUrl(address)
  const lnurl = encoded === null ? null : parseLnurl(encoded)
  if (lnurl === null) {
    throw new InvariantError(`${address} is branded a LightningAddress but its pay URL is not an Lnurl`)
  }
  return lnurl
}

export type { LightningAddress, Lnurl, ZapAddress }
