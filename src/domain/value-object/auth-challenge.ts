import type { Brand, BrandTools } from "./brand.ts"
import { createBrand } from "./brand.ts"

declare const authChallengeBrand: unique symbol

/** Branded NIP-42 `AUTH` challenge a relay sent: any non-empty string. Construct via `parseAuthChallenge`. */
type AuthChallenge = Brand<typeof authChallengeBrand>

const authChallengeTools: BrandTools<AuthChallenge> = createBrand({ canonicalise: (raw) => raw === "" ? null : raw })

/** Parse untrusted input as an `AuthChallenge`: the string itself, or `null` when it is empty or not a string. */
export const parseAuthChallenge = authChallengeTools.parse
/** Type guard: `true` for any non-empty string. */
export const isValidAuthChallenge = authChallengeTools.is
export type { AuthChallenge }
