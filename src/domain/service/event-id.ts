import { sha256Hex } from "./sha256.ts"
import type { EventId } from "../value-object/event-id.ts"
import { parseEventId } from "../value-object/event-id.ts"
import type { UnsignedEvent } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"

export interface EventToSign extends UnsignedEvent {
  readonly pubkey: PublicKey
}

const serialise = (event: EventToSign): string =>
  JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content])

/** Compute the canonical NIP-01 event ID: SHA-256 of `[0, pubkey, created_at, kind, tags, content]`. */
export const computeEventId = async (event: EventToSign): Promise<EventId> =>
  parseEventId(await sha256Hex(serialise(event)))
