import type { EventId } from "./event-id.ts"
import type { PublicKey } from "./public-key.ts"

/**
 * NIP-01 `REQ` filter — selects events by id / author / kind / time range / tag value. The
 * `#<letter>` index signature carries single-letter tag filters (`#e`, `#p`, `#d`, etc.); see
 * `matchesFilter` for the matching semantics.
 */
export interface NostrFilter {
  readonly ids?: ReadonlyArray<EventId>
  readonly authors?: ReadonlyArray<PublicKey>
  readonly kinds?: ReadonlyArray<number>
  readonly since?: number
  readonly until?: number
  readonly limit?: number
  readonly search?: string
  readonly [key: `#${string}`]: ReadonlyArray<string> | undefined
}
