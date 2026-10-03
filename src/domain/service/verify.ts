import { schnorr } from "@noble/curves/secp256k1"
import { brandBytes } from "./hex.ts"
import type { NostrEvent } from "../value-object/nostr-event.ts"
import { computeEventId } from "./event-id.ts"

/**
 * Verify a Nostr event end-to-end: recomputes the ID and checks the Schnorr signature against `event.pubkey`. Total: a
 * key that is not a curve point or a signature out of range is `false`, never a throw. Synchronous.
 */
export const verifyEventSignature = (event: NostrEvent): boolean => {
  if (computeEventId(event) !== event.id) return false
  return schnorr.verify(brandBytes(event.sig), brandBytes(event.id), brandBytes(event.pubkey))
}
