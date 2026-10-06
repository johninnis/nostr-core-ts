import type { Tag, UnsignedEvent } from "../value-object/nostr-event.ts"
import { InvalidArgumentError } from "../exception/invalid-argument-error.ts"
import { parseDecimalInteger } from "./decimal.ts"
import { isNonNegativeInteger } from "./guards.ts"
import { extractTagValues } from "./tags.ts"

const expiresAtOrBefore = (value: string, at: number): boolean => {
  const expiresAt = parseDecimalInteger(value)
  return expiresAt !== null && expiresAt <= at
}

// Deliberate: expired once ANY stated expiry has passed, so tag order never decides — see shared ADR-0011
/**
 * Whether `event` is expired at `at` (Unix seconds) under NIP-40: `true` once any of its `expiration` tags names a time
 * at or before `at`. A value that is not a decimal Unix timestamp is not an expiry and is ignored.
 */
export const isEventExpired = (event: { readonly tags: ReadonlyArray<Tag> }, at: number): boolean =>
  extractTagValues(event.tags, "expiration").some((value) => expiresAtOrBefore(value, at))

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
