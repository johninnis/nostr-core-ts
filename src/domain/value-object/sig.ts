import type { Brand, BrandTools } from "./brand.ts"
import { createHexBrand } from "./brand.ts"

declare const sigBrand: unique symbol

/** Branded 128-char lowercase-hex Schnorr signature (NIP-01 `sig`). Construct via `parseSig`. */
type Sig = Brand<typeof sigBrand>

const sigTools: BrandTools<Sig> = createHexBrand(128)

/**
 * Parse untrusted input as a `Sig`: 128 lowercase hex chars (NIP-01) returned branded, or `null` for anything else,
 * upper-case hex included.
 */
export const parseSig = sigTools.parse
/** Type guard: `true` only for a signature already in canonical form (128 lowercase hex chars). */
export const isValidSig = sigTools.is
export type { Sig }
