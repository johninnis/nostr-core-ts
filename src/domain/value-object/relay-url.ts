// `new URL()` is the only sanctioned URL parser in JS and it signals failure by throwing.
// deno-lint-ignore-file innis/no-catch-in-layer

import type { Brand, BrandTools } from "./brand.ts"
import { createBrand } from "./brand.ts"

declare const relayUrlBrand: unique symbol

export type RelayUrl = Brand<typeof relayUrlBrand>

const WSS_REGEX = /^wss?:\/\/.+/

const canonicaliseRelayUrl = (raw: string): string => {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return raw.replace(/\/+$/, "")
  }
  parsed.protocol = parsed.protocol.toLowerCase()
  parsed.hostname = parsed.hostname.toLowerCase()
  return parsed.toString().replace(/\/+$/, "")
}

const relayUrlTools: BrandTools<RelayUrl, "InvalidRelayUrlError"> = createBrand({
  errorName: "InvalidRelayUrlError",
  errorPrefix: "Invalid relay URL",
  validate: (raw) => WSS_REGEX.test(raw),
  normalise: canonicaliseRelayUrl,
})

/**
 * Parse `raw` as a canonical `RelayUrl`; **always normalises** (lowercases scheme/host, strips trailing
 * slashes) before validating, and throws `InvalidRelayUrlError` if the result isn't a `ws(s)://…` URL.
 *
 * Pairs with `normaliseRelayUrl` (same normalisation, returns `null` on failure instead of throwing).
 * Use `parseRelayUrl` at trust boundaries where invalid input is a programmer error; use
 * `normaliseRelayUrl` when you're cleaning user-typed or third-party data.
 */
export const parseRelayUrl = relayUrlTools.parse
/** Type guard: `true` if `raw` is already in canonical `ws(s)://…` form. */
export const isValidRelayUrl = relayUrlTools.isValid
/** Thrown by `parseRelayUrl` when the input isn't a canonical `ws(s)://` URL. */
export const InvalidRelayUrlError = relayUrlTools.InvalidError

/**
 * Lenient sibling of `parseRelayUrl`: normalises `url` (lowercase scheme/host, strip trailing slashes)
 * and returns the resulting `RelayUrl`, or `null` if the input isn't a parseable `ws(s)://` URL.
 *
 * Sugar for `relayUrlTools.tryParse` — same normalisation as `parseRelayUrl`, differs only in
 * failure mode (`null` vs throw).
 */
export const normaliseRelayUrl = relayUrlTools.tryParse

/**
 * Normalise a list of URL strings into deduplicated `RelayUrl`s; invalid/null entries are dropped,
 * order of first occurrence is preserved. Convenience wrapper around `normaliseRelayUrl` + a Set.
 */
export const toRelayUrls = (urls: ReadonlyArray<string | null | undefined>): ReadonlyArray<RelayUrl> => {
  const seen = new Set<RelayUrl>()
  const out: Array<RelayUrl> = []
  for (const url of urls) {
    const normalised = normaliseRelayUrl(url)
    if (!normalised || seen.has(normalised)) continue
    seen.add(normalised)
    out.push(normalised)
  }
  return out
}

/** Convert a `ws://` / `wss://` URL into the matching `http(s)://` URL used for NIP-11 document fetches. */
export const wsToHttp = (url: string): string => url.replace(/^ws(s?):\/\//, "http$1://")
