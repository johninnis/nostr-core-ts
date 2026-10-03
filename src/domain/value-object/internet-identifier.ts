import { endsInNumber } from "./ip-address.ts"
import { trimUnicodeWhitespace } from "./trim.ts"

const NON_ASCII_REGEX = /\P{ASCII}/u
const DOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/

/**
 * The name before the first `@` of an email-like `name@domain` identifier and the domain after it; no `@` is all name.
 */
export const splitInternetIdentifier = (identifier: string): { readonly name: string; readonly domain: string } => {
  const at = identifier.indexOf("@")
  return at === -1
    ? { name: identifier, domain: "" }
    : { name: identifier.slice(0, at), domain: identifier.slice(at + 1) }
}

/**
 * Canonicalise an email-like `name@domain` identifier, or `null`. Only whitespace around the whole input is trimmed
 * (U+0009 to U+000D, every `Zs` space separator, U+2028, U+2029 and U+FEFF); the name must match `namePattern` as
 * written, and the domain must be ASCII before it is lower-cased (an internationalised name travels as punycode) and a
 * DNS name of two or more labels whose last label is not numeric, so that no URL parser reads it as an IPv4 address.
 */
export const canonicaliseInternetIdentifier = (raw: string, namePattern: RegExp): string | null => {
  const { name, domain: rawDomain } = splitInternetIdentifier(trimUnicodeWhitespace(raw))
  if (NON_ASCII_REGEX.test(rawDomain)) return null
  const domain = rawDomain.toLowerCase()
  if (!namePattern.test(name) || !DOMAIN_REGEX.test(domain) || endsInNumber(domain)) return null
  return `${name}@${domain}`
}
