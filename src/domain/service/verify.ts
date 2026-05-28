import { schnorr } from "@noble/curves/secp256k1"
import { parseHex } from "../value-object/hex.ts"
import type { NostrEvent } from "../value-object/nostr-event.ts"
import { computeEventId } from "./event-id.ts"

/** Verify a Nostr event end-to-end: recomputes the ID and checks the Schnorr signature against `event.pubkey`. */
export const verifyEventSignature = async (event: NostrEvent): Promise<boolean> => {
  const expectedId = await computeEventId(event)
  if (expectedId !== event.id) return false
  try {
    return schnorr.verify(parseHex(event.sig), parseHex(event.id), parseHex(event.pubkey))
  } // deno-lint-ignore innis/no-catch-in-layer -- schnorr.verify signals malformed input by throwing
  catch {
    return false
  }
}
