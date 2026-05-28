import type { Brand, BrandTools } from "./brand.ts"
import { createHexBrand } from "./brand.ts"

declare const sigBrand: unique symbol

type Sig = Brand<typeof sigBrand>

const sigTools: BrandTools<Sig, "InvalidSigError"> = createHexBrand({
  errorName: "InvalidSigError",
  errorPrefix: "Invalid signature",
  hexLength: 128,
})

/** Parse a 128-char lowercase-hex string as a Schnorr `Sig`; throws `InvalidSigError` on failure. */
export const parseSig = sigTools.parse
/** Type guard: `true` if `raw` is a 128-char lowercase-hex string. */
export const isValidSig = sigTools.isValid
/** Thrown by `parseSig` when the input is not a 128-char lowercase-hex string. */
export const InvalidSigError = sigTools.InvalidError
export type { Sig }
