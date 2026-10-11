import { parseCompressedKey } from "./p2pk-secret.ts"
import { extractTagValues, soleTagValue } from "./tags.ts"
import { lowerAscii } from "../value-object/ascii-case.ts"
import { KIND_NUTZAP_MINT_RECOMMENDATION } from "../value-object/kinds.ts"
import type { NostrEvent } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { parsePublicKey } from "../value-object/public-key.ts"
import type { RelayUrl } from "../value-object/relay-url.ts"
import { parseRelayUrl } from "../value-object/relay-url.ts"
import type { WebUrl } from "../value-object/web-url.ts"
import { parseWebUrl } from "../value-object/web-url.ts"

/**
 * A NIP-61 kind 10019 nutzap informational event as `parseNutzapInfo` read it (shared ADR-0121): its author
 * (`pubkey`), the one key nutzaps to that author are P2PK-locked to (`p2pkPubkey`, an x-coordinate), the mints it takes
 * nutzaps at, each kept as written and listed once, and the relays it reads them from, each canonical and listed once.
 */
export interface NutzapInfo {
  readonly pubkey: PublicKey
  readonly p2pkPubkey: PublicKey
  readonly mints: ReadonlyArray<WebUrl>
  readonly relays: ReadonlyArray<RelayUrl>
}

const xCoordinateOf = (key: string): PublicKey | null => parseCompressedKey(key) ?? parsePublicKey(lowerAscii(key))

// Deliberate: no one P2PK key, or the author's own, is no nutzap info, never a fall-back to the author's key — see shared ADR-0121
/**
 * Read a kind 10019 event as a recipient's nutzap info (NIP-61, shared ADR-0121). Its `pubkey` tags are one claim
 * (shared ADR-0014) in the key's x-coordinate, written bare or with a `02` or `03` prefix, in either case of hex; a value
 * that is no key takes no part. Its `mint` tags are read as `http` or `https` URLs kept as written, its `relay` tags as
 * canonical relay URLs, each once, dropping any other value; the units a `mint` tag lists are not read. Returns `null`
 * for another kind, for an event whose `pubkey` tags give no one key, and for one whose key is its author's own, which
 * NIP-61 says "MUST NOT" be used: no reader falls back to the author's key.
 */
export const parseNutzapInfo = (event: NostrEvent): NutzapInfo | null => {
  if (event.kind !== KIND_NUTZAP_MINT_RECOMMENDATION) return null
  const p2pkPubkey = soleTagValue(event.tags, "pubkey", xCoordinateOf).value
  if (p2pkPubkey === null || p2pkPubkey === event.pubkey) return null
  return {
    pubkey: event.pubkey,
    p2pkPubkey,
    mints: extractTagValues(event.tags, "mint").flatMap((mint) => parseWebUrl(mint) ?? []),
    relays: [...new Set(extractTagValues(event.tags, "relay").flatMap((relay) => parseRelayUrl(relay) ?? []))],
  }
}
