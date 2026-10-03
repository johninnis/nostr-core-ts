import type { EventId } from "../../domain/value-object/event-id.ts"

/**
 * Replay-protection store the NIP-98 validator depends on — `recordOnce` returns `true` on first sight of `eventId` and
 * `false` on every subsequent sighting within `ttlSeconds`. The host supplies it, backed by whatever store it runs.
 */
export interface Nip98ReplayGuard {
  readonly recordOnce: (eventId: EventId, ttlSeconds: number) => Promise<boolean>
}
