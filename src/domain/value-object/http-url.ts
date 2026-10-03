import type { Brand, BrandTools } from "./brand.ts"
import { createBrand } from "./brand.ts"
import { parseIpv6Address } from "./ip-address.ts"

declare const httpUrlBrand: unique symbol

/**
 * Branded absolute `http` or `https` URL in the one form NIP-98 compares and writes it in (shared ADR-0081). Construct
 * via `parseHttpUrl`.
 */
export type HttpUrl = Brand<typeof httpUrlBrand>

const HTTP_URL = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(?:#[\s\S]*)?$/
const PORT = /^(?:[1-9]\d{0,4})?$/
const DEFAULT_PORTS: Readonly<Record<string, string>> = { http: "80", https: "443" }
const MAX_PORT = 65535

const LAST_C0_CONTROL = 0x1f
const DELETE = 0x7f
const LAST_C1_CONTROL = 0x9f

const isControlCharacter = (character: string): boolean => {
  const code = character.charCodeAt(0)
  return code <= LAST_C0_CONTROL || (code >= DELETE && code <= LAST_C1_CONTROL)
}

const hasControlCharacter = (text: string): boolean => [...text].some(isControlCharacter)

const lowerAscii = (text: string): string => text.replace(/[A-Z]/g, (letter) => letter.toLowerCase())

interface HostAndPort {
  readonly host: string
  readonly port: string
}

const IP_LITERAL_AUTHORITY = /^(\[([^\]]*)\])(?::(.*))?$/
const RFC_3986_NON_EMPTY_REG_NAME = /^(?:[A-Za-z0-9\-._~!$&'()*+,;=]|%[0-9A-Fa-f]{2})+$/

const splitHostAndPort = (authority: string): HostAndPort | null => {
  const hostAndPort = authority.slice(authority.lastIndexOf("@") + 1)
  if (hostAndPort.startsWith("[")) {
    const literal = IP_LITERAL_AUTHORITY.exec(hostAndPort)
    return literal === null || parseIpv6Address(literal[2] ?? "") === null
      ? null
      : { host: literal[1] ?? "", port: literal[3] ?? "" }
  }
  const colon = hostAndPort.indexOf(":")
  const host = colon === -1 ? hostAndPort : hostAndPort.slice(0, colon)
  return RFC_3986_NON_EMPTY_REG_NAME.test(host)
    ? { host, port: colon === -1 ? "" : hostAndPort.slice(colon + 1) }
    : null
}

// Deliberate: only scheme, host and default port are normalised, as the PHP HttpUrl reads a URL — see shared ADR-0081
const canonicaliseHttpUrl = (raw: string): string | null => {
  const parts = hasControlCharacter(raw) ? null : HTTP_URL.exec(raw)
  const scheme = lowerAscii(parts?.[1] ?? "")
  const defaultPort = DEFAULT_PORTS[scheme]
  const hostAndPort = parts === null ? null : splitHostAndPort(parts[2] ?? "")
  if (parts === null || defaultPort === undefined || hostAndPort === null) return null
  const { host, port } = hostAndPort
  if (!PORT.test(port) || Number(port) > MAX_PORT) return null
  const authority = port === "" || port === defaultPort ? lowerAscii(host) : `${lowerAscii(host)}:${port}`
  return `${scheme}://${authority}${parts[3] || "/"}${parts[4] ?? ""}`
}

const httpUrlTools: BrandTools<HttpUrl> = createBrand({ canonicalise: canonicaliseHttpUrl })

/**
 * Parse untrusted input as an `HttpUrl`, an absolute `http` or `https` URL in the one form NIP-98 compares it in:
 * scheme and host lower-cased (ASCII only), the scheme's default port dropped, credentials and fragment dropped, an
 * absent path written `/`, and the path and the query — an empty `?` included — kept exactly as written. `null` for
 * any other scheme, no host, a host outside RFC 3986's grammar (a registered name of anything but unreserved
 * characters, sub-delimiters and `%XX` escapes — so no space, backslash or non-ASCII letter — or an IP literal that is
 * not an IPv6 address), a port that is not a canonical decimal from 1 to 65535, or a control character (C0, DEL or C1)
 * anywhere.
 */
export const parseHttpUrl = httpUrlTools.parse

/**
 * Type guard: `true` only for a URL already in canonical form, that is when `parseHttpUrl` would return it unchanged.
 */
export const isValidHttpUrl = httpUrlTools.is
