import type { Brand, BrandTools } from "./brand.ts"
import { createBrand } from "./brand.ts"

declare const nip05IdBrand: unique symbol

/** Branded NIP-05 identifier in canonical `name@domain.tld` form (lowercased, regex-validated). Construct via `parseNip05Id`. */
type Nip05Id = Brand<typeof nip05IdBrand>

const NIP05_ID_REGEX = /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/

const nip05IdTools: BrandTools<Nip05Id, "InvalidNip05IdError"> = createBrand({
  errorName: "InvalidNip05IdError",
  errorPrefix: "Invalid NIP-05 identifier",
  validate: (raw) => NIP05_ID_REGEX.test(raw),
  normalise: (raw) => raw.trim().toLowerCase(),
})

/** Parse `raw` as a `Nip05Id` (trimmed, lowercased, NIP-05 regex-validated); throws `InvalidNip05IdError` on failure. */
export const parseNip05Id = nip05IdTools.parse
/** Type guard: `true` if `raw` is a canonical lowercased `name@domain.tld` per the NIP-05 regex. */
export const isValidNip05Id = nip05IdTools.isValid
/** Thrown by `parseNip05Id` when the input isn't a valid `name@domain.tld` identifier. */
export const InvalidNip05IdError = nip05IdTools.InvalidError
export type { Nip05Id }
