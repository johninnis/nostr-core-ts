import type { Brand, BrandTools } from "./brand.ts"
import { createHexBrand } from "./brand.ts"

declare const publicKeyBrand: unique symbol

/** Branded 64-char lowercase-hex secp256k1 x-only public key (NIP-01 `pubkey`). Construct via `parsePublicKey`. */
type PublicKey = Brand<typeof publicKeyBrand>

const publicKeyTools: BrandTools<PublicKey, "InvalidPublicKeyError"> = createHexBrand({
  errorName: "InvalidPublicKeyError",
  errorPrefix: "Invalid public key",
  hexLength: 64,
})

/** Parse a 64-char lowercase-hex string as a `PublicKey`; throws `InvalidPublicKeyError` on failure. */
export const parsePublicKey = publicKeyTools.parse
/** Type guard: `true` if `raw` is a 64-char lowercase-hex string. */
export const isValidPublicKey = publicKeyTools.isValid
/** Thrown by `parsePublicKey` when the input is not a 64-char lowercase-hex string. */
export const InvalidPublicKeyError = publicKeyTools.InvalidError
export type { PublicKey }
