import type { Brand, BrandTools } from "./brand.ts"
import { createHexBrand } from "./brand.ts"

declare const eventIdBrand: unique symbol

/**
 * Branded 64-char lowercase-hex SHA-256 NIP-01 event id. Construct via `parseEventId`, or `buildRumour` for an unsigned
 * event's id.
 */
type EventId = Brand<typeof eventIdBrand>

const eventIdTools: BrandTools<EventId> = createHexBrand(64)

/**
 * Parse untrusted input as an `EventId`: 64 lowercase hex chars (NIP-01) returned branded, or `null` for anything else,
 * upper-case hex included.
 */
export const parseEventId = eventIdTools.parse
/** Type guard: `true` only for an event id already in canonical form (64 lowercase hex chars). */
export const isValidEventId = eventIdTools.is
export type { EventId }
