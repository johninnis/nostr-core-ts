import type { Brand, BrandTools } from "./brand.ts"
import { createBrand } from "./brand.ts"

declare const subscriptionIdBrand: unique symbol

/**
 * Branded NIP-01 subscription id: "an arbitrary, non-empty string of max length 64 chars", a well-formed Unicode string
 * measured in code points. Construct via `parseSubscriptionId`.
 */
type SubscriptionId = Brand<typeof subscriptionIdBrand>

const MAX_SUBSCRIPTION_ID_LENGTH = 64

const subscriptionIdTools: BrandTools<SubscriptionId> = createBrand({
  canonicalise: (raw) => raw !== "" && raw.isWellFormed() && [...raw].length <= MAX_SUBSCRIPTION_ID_LENGTH ? raw : null,
})

/**
 * Parse untrusted input as a `SubscriptionId`: the string itself, or `null` when it is not a string, is empty, holds a
 * lone surrogate or exceeds 64 code points.
 */
export const parseSubscriptionId = subscriptionIdTools.parse
/** Type guard: `true` for a non-empty, well-formed string of at most 64 code points. */
export const isValidSubscriptionId = subscriptionIdTools.is
export type { SubscriptionId }
