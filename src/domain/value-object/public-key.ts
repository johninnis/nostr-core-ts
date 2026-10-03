import type { Brand, BrandTools } from "./brand.ts"
import { createHexBrand } from "./brand.ts"

declare const publicKeyBrand: unique symbol

/** Branded 64-char lowercase-hex secp256k1 x-only public key (NIP-01 `pubkey`). Construct via `parsePublicKey`. */
type PublicKey = Brand<typeof publicKeyBrand>

const publicKeyTools: BrandTools<PublicKey> = createHexBrand(64)

/**
 * Parse untrusted input as a `PublicKey`: 64 lowercase hex chars (NIP-01) returned branded, or `null` for anything
 * else, upper-case hex included.
 */
export const parsePublicKey = publicKeyTools.parse
/** Type guard: `true` only for a public key already in canonical form (64 lowercase hex chars). */
export const isValidPublicKey = publicKeyTools.is
export type { PublicKey }
