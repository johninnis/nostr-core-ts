import type { Brand, BrandTools } from "./brand.ts"
import { createBrand } from "./brand.ts"
import { canonicaliseInternetIdentifier } from "./internet-identifier.ts"

declare const nip05IdBrand: unique symbol

/**
 * Branded NIP-05 identifier in canonical `local-part@domain` form: a local part of `a-z0-9-_.` as written, and a
 * lower-cased DNS domain. Construct via `parseNip05Id`.
 */
type Nip05Id = Brand<typeof nip05IdBrand>

const LOCAL_PART_REGEX = /^[a-z0-9._-]+$/

const nip05IdTools: BrandTools<Nip05Id> = createBrand({
  canonicalise: (raw) => canonicaliseInternetIdentifier(raw, LOCAL_PART_REGEX),
})

/**
 * Parse untrusted input as a `Nip05Id`, or `null` when it is not one. The local part must already be `a-z0-9-_.`
 * (NIP-05) and is never rewritten, so an upper-case local part is refused; the domain must be ASCII (an
 * internationalised name travels as punycode) and is lower-cased, because DNS compares names without regard to case,
 * and must be a DNS name (NIP-05: "DNS-based internet identifiers") of two or more labels whose last label is
 * not numeric, so no URL parser reads it as an IPv4 address. Whitespace around the whole input is trimmed;
 * whitespace inside it is refused. Lower-casing what a person typed is the input edge's job.
 */
export const parseNip05Id = nip05IdTools.parse
/** Type guard: `true` only for an identifier already in canonical form (lower-case domain, no surrounding space). */
export const isValidNip05Id = nip05IdTools.is
export type { Nip05Id }
