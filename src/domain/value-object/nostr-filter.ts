import type { EventId } from "./event-id.ts"
import type { PublicKey } from "./public-key.ts"

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
