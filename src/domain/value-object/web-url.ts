import type { Brand, BrandTools } from "./brand.ts"
import { createBrand } from "./brand.ts"
import { parseHttpUrl } from "./http-url.ts"

declare const webUrlBrand: unique symbol

/**
 * An `http` or `https` URL a client opens or fetches, such as an image, a stream or a web page, checked by `HttpUrl`'s
 * rules and kept exactly as written (shared ADR-0079, shared ADR-0090). Construct via `parseWebUrl`.
 */
export type WebUrl = Brand<typeof webUrlBrand>

const webUrlTools: BrandTools<WebUrl> = createBrand({
  canonicalise: (raw) => parseHttpUrl(raw) === null ? null : raw,
})

/** Parse untrusted input as a `WebUrl`: the input unchanged, or `null` whenever `parseHttpUrl` gives it no form. */
export const parseWebUrl = webUrlTools.parse

/** Type guard: `true` for any string `parseHttpUrl` gives a form, however it is written. */
export const isValidWebUrl = webUrlTools.is
