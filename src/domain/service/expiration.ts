import type { Tag, UnsignedEvent } from "../value-object/nostr-event.ts"
import { InvalidArgumentError } from "../exception/invalid-argument-error.ts"
import { parseDecimalInteger } from "./decimal.ts"
import { isNonNegativeInteger } from "./guards.ts"
import { extractTagValues } from "./tags.ts"

// Deliberate: the earliest stated expiry that parses decides, so tag order never does — see shared ADR-0011
/**
 * The earliest expiry `event` states (Unix seconds), or `null` when none of its `expiration` tags parses as a
 * canonical decimal — a value with a sign or a leading zero is not an expiry and is ignored. Public so a store can
 * derive the same instant from the tag values it indexed, without decoding the event.
 */
export const expiryOf = (event: { readonly tags: ReadonlyArray<Tag> }): number | null => {
  let earliest: number | null = null
  for (const value of extractTagValues(event.tags, "expiration")) {
    const expiresAt = parseDecimalInteger(value)
    if (expiresAt !== null && (earliest === null || expiresAt < earliest)) {
      earliest = expiresAt
    }
  }
  return earliest
}

/**
 * Whether `event` is expired at `at` (Unix seconds) under NIP-40: `true` once the earliest expiry it states is at or
 * before `at`, which is once any stated expiry has passed.
 */
export const isEventExpired = (event: { readonly tags: ReadonlyArray<Tag> }, at: number): boolean => {
  const expiresAt = expiryOf(event)
  return expiresAt !== null && expiresAt <= at
}

/**
 * `event` with one NIP-40 `expiration` tag naming `expiresAt` (Unix seconds), replacing any `expiration` tags it
 * carries — a reader tolerates many (shared ADR-0011), but a writer emits exactly one. Signed events are excluded by
 * the type: tags are hash-covered, so an expiry can only be written before signing. An `expiresAt` that is not a whole
 * number of seconds of zero or more throws `InvalidArgumentError`.
 */
export const withExpiration = <T extends UnsignedEvent>(event: T, expiresAt: number): T => {
  if (!isNonNegativeInteger(expiresAt)) {
    throw new InvalidArgumentError(`A NIP-40 expiration is a whole number of seconds, not ${expiresAt}`)
  }
  return {
    ...event,
    tags: [...event.tags.filter((tag) => tag[0] !== "expiration"), ["expiration", String(expiresAt)]],
  }
}
