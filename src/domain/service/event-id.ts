import { sha256Hex } from "./sha256.ts"
import type { EventId } from "../value-object/event-id.ts"
import { parseEventId } from "../value-object/event-id.ts"
import type { UnsignedEvent } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { InvariantError } from "../exception/invariant-error.ts"

/**
 * Input shape for `buildRumour`: an `UnsignedEvent` plus the author's `pubkey` (the five fields the canonical NIP-01
 * serialisation hashes).
 */
export interface EventToSign extends UnsignedEvent {
  readonly pubkey: PublicKey
}

// Deliberate: control characters beyond NIP-01's seven are written \u00XX, as JSON encoders write them — see ADR-0036
const serialise = (event: EventToSign): string =>
  JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content])

/**
 * Compute the canonical NIP-01 event ID: SHA-256 of `[0, pubkey, created_at, kind, tags, content]`. Internal: it hashes
 * whatever it is given, so the package reaches it only through `buildRumour`, which refuses a template that is not a
 * NIP-01 event, and `verifyEventSignature`, which compares the result to an id already there. Synchronous.
 */
export const computeEventId = (event: EventToSign): EventId => {
  const id = parseEventId(sha256Hex(serialise(event)))
  if (id === null) throw new InvariantError("SHA-256 produced a digest that is not a 64-char hex event id")
  return id
}
