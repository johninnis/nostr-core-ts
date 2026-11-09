import type { Brand, BrandTools } from "./brand.ts"
import { createBrand } from "./brand.ts"
import { InvalidArgumentError } from "../exception/invalid-argument-error.ts"

declare const httpMethodBrand: unique symbol

/** Branded HTTP method: an RFC 9110 token, its case kept (shared ADR-0130). Construct via `parseHttpMethod`. */
export type HttpMethod = Brand<typeof httpMethodBrand>

const RFC_9110_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

const httpMethodTools: BrandTools<HttpMethod> = createBrand({
  canonicalise: (raw) => RFC_9110_TOKEN.test(raw) ? raw : null,
})

// Deliberate: the empty string names no method, so a host that failed to read its request's method cannot match a signer's empty method tag — see shared ADR-0130
/** Parse untrusted input as an `HttpMethod`, kept exactly as written. `null` for anything that is not an RFC 9110 token, the empty string included. */
export const parseHttpMethod = httpMethodTools.parse

/** Type guard: `true` exactly when `raw` is an RFC 9110 token. */
export const isValidHttpMethod = httpMethodTools.is

/**
 * Brand a method the caller knows at build time, such as `httpMethodFrom("POST")`. Throws `InvalidArgumentError` for
 * anything that is not an RFC 9110 token, a programmer error; a method read from elsewhere goes through `parseHttpMethod`.
 */
export const httpMethodFrom = (raw: string): HttpMethod => {
  const method = parseHttpMethod(raw)
  if (method === null) throw new InvalidArgumentError(`An HTTP method is an RFC 9110 token, not ${JSON.stringify(raw)}`)
  return method
}
