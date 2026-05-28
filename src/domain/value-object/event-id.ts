import type { Brand, BrandTools } from "./brand.ts"
import { createHexBrand } from "./brand.ts"

declare const eventIdBrand: unique symbol

type EventId = Brand<typeof eventIdBrand>

const eventIdTools: BrandTools<EventId, "InvalidEventIdError"> = createHexBrand({
  errorName: "InvalidEventIdError",
  errorPrefix: "Invalid event ID",
  hexLength: 64,
})

/** Parse a 64-char lowercase-hex string as an `EventId`; throws `InvalidEventIdError` on failure. */
export const parseEventId = eventIdTools.parse
/** Type guard: `true` if `raw` is a 64-char lowercase-hex string. */
export const isValidEventId = eventIdTools.isValid
/** Thrown by `parseEventId` when the input is not a 64-char lowercase-hex string. */
export const InvalidEventIdError = eventIdTools.InvalidError
export type { EventId }
