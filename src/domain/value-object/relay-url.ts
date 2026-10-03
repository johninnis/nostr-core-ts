import type { Brand, BrandTools } from "./brand.ts"
import { createBrand } from "./brand.ts"
import { endsInNumber, parseIpv4Address } from "./ip-address.ts"
import { trimSpaceAndNul } from "./trim.ts"
import type { HttpUrl } from "./http-url.ts"
import { parseHttpUrl } from "./http-url.ts"
import { InvariantError } from "../exception/invariant-error.ts"

declare const relayUrlBrand: unique symbol

/**
 * Branded canonical relay URL (`ws://` or `wss://`, lowercased scheme/host, no default port, no trailing slash or
 * punctuation). Construct via `parseRelayUrl`.
 */
export type RelayUrl = Brand<typeof relayUrlBrand>

const HOSTNAME_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/
const URL_CHARACTERS_REGEX = /^[A-Za-z0-9\-._~:/?[\]@!$&()*+,;=%]+$/
const ENCODED_CONTROL_REGEX = /%(?:[01][0-9a-f]|20|7f)/i
const CONCATENATED_URL_REGEX = /wss?:\/\//
const MAX_LENGTH = 200

const isCanonicalNumericHost = (host: string): boolean => !endsInNumber(host) || parseIpv4Address(host) !== null

const rawAuthorityOf = (url: string): string => url.slice(url.indexOf("//") + 2).split(/[/?]/, 1)[0] ?? ""

// Deliberate: these rules are re-declared in @innis/nostr-relay-selection; change the corpus first — see ADR-0010
const canonicaliseRelayUrl = (raw: string): string | null => {
  const trimmed = trimSpaceAndNul(raw)
  if (!/^wss?:\/\//i.test(trimmed) || !URL_CHARACTERS_REGEX.test(trimmed) || ENCODED_CONTROL_REGEX.test(trimmed)) {
    return null
  }

  const parsed = URL.parse(trimmed)
  if (parsed === null) return null
  const authority = rawAuthorityOf(trimmed)
  if (authority === "" || /[@%]/.test(authority) || !isCanonicalNumericHost(authority.replace(/:[0-9]*$/, ""))) {
    return null
  }

  const scheme = parsed.protocol.slice(0, -1)
  const hostname = parsed.hostname
  if (!HOSTNAME_REGEX.test(hostname) || hostname.includes("..")) return null

  if (parsed.port === "0") return null
  const port = parsed.port === "" ? "" : `:${parsed.port}`

  const path = parsed.pathname.replace(/[,.;!/]+$/, "")
  if (path.includes("//") || path.includes(hostname)) return null

  const canonical = `${scheme}://${hostname}${port}${path}${parsed.search}`
  if (canonical.length > MAX_LENGTH) return null
  if (CONCATENATED_URL_REGEX.test(canonical.slice(`${scheme}://${hostname}`.length))) return null
  return canonical
}

const relayUrlTools: BrandTools<RelayUrl> = createBrand({ canonicalise: canonicaliseRelayUrl })

/**
 * Parse untrusted input as a canonical `RelayUrl` (space, tab, line feed, carriage return, NUL and vertical tab trimmed
 * from its ends, lowercased scheme and host, no default port, no trailing slash or punctuation), or `null` when it
 * can't be reduced to one canonical `ws(s)://` URL.
 */
export const parseRelayUrl = relayUrlTools.parse

/**
 * Type guard: `true` only for a URL already in canonical form, that is when `parseRelayUrl` would return it unchanged.
 */
export const isValidRelayUrl = relayUrlTools.is

/**
 * Normalise a list of URL strings into deduplicated `RelayUrl`s; invalid/null entries are dropped,
 * order of first occurrence is preserved.
 */
export const toRelayUrls = (urls: ReadonlyArray<string | null | undefined>): ReadonlyArray<RelayUrl> => [
  ...new Set(urls.flatMap((url) => parseRelayUrl(url) ?? [])),
]

/**
 * The relay's own URI under the matching `http(s)` scheme, as an `HttpUrl`, where NIP-11 serves its information
 * document and NIP-86 its management API ("the same URI as the relay's websocket").
 */
export const wsToHttp = (relay: RelayUrl): HttpUrl => {
  const url = parseHttpUrl(relay.replace(/^ws(s?):\/\//, "http$1://"))
  if (url === null) throw new InvariantError(`${relay} is branded a RelayUrl but its http(s) form is not an HttpUrl`)
  return url
}
