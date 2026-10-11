import { parseNutzap } from "../../src/domain/service/zap-parser.ts"
import type { Nutzap } from "../../src/domain/service/zap-parser.ts"
import { parseNutzapInfo } from "../../src/domain/service/nutzap-info.ts"
import type { NutzapInfo } from "../../src/domain/service/nutzap-info.ts"
import { KIND_NUTZAP, KIND_NUTZAP_MINT_RECOMMENDATION } from "../../src/domain/value-object/kinds.ts"
import type { NostrEvent, Tag } from "../../src/domain/value-object/nostr-event.ts"
import { buildEventFixture } from "../../testing.ts"

/** The author of every fixture nutzap. */
export const SENDER = "a".repeat(64)
/** The recipient every fixture nutzap names, and the author of the recipient's fixture nutzap info. */
export const RECIPIENT = "b".repeat(64)
/** The x-coordinate of the recipient's P2PK key, NIP-61's own example lock. */
export const P2PK_KEY = "eaee8939e3565e48cc62967e2fde9d8e2a4b3ec0081f29eceff5c64ef10ac1ed"
/** The x-coordinate of a P2PK key that is not the recipient's, NUT-11's own example lock. */
export const OTHER_P2PK_KEY = "49098aa8b9d2fbec49ff8598feb17b592b986e62319a4fa488a3dc36387157a7"
/** The one mint the recipient's fixture nutzap info lists. */
export const MINT = "https://mint.example"
/** The keyset id every fixture proof names. */
export const KEYSET_ID = "000a93d6f8a1d2c4"
/** The unblinded signature (`C`) every fixture proof carries, NIP-61's own example. */
export const UNBLINDED_SIGNATURE = "02277c66191736eb72fce9d975d08e3191f8f96afb73ab1eec37e4465683066d3f"
/** The DLEQ challenge (`e`) every fixture proof carries. */
export const DLEQ_E = "1".repeat(64)
/** The DLEQ response (`s`) every fixture proof carries. */
export const DLEQ_S = "2".repeat(64)
/** The DLEQ blinding factor (`r`) every fixture proof carries. */
export const DLEQ_R = "3".repeat(64)

/** A NUT-10 P2PK secret whose `data` is `lockKey`, as written. */
export const secretFor = (lockKey: string): string =>
  JSON.stringify(["P2PK", { nonce: "b00bdd0467b0090a25bdf2d2f0d45ac4e355c482c1418350f273a04fedaaee83", data: lockKey }])

/**
 * A `proof` tag stating `amount` whose secret locks it to `lockKey`, the recipient's key by default, with the fixture
 * keyset id, unblinded signature and DLEQ.
 */
export const proofTag = (amount: number, lockKey = `02${P2PK_KEY}`): Tag => [
  "proof",
  JSON.stringify({
    amount,
    id: KEYSET_ID,
    secret: secretFor(lockKey),
    C: UNBLINDED_SIGNATURE,
    dleq: { e: DLEQ_E, s: DLEQ_S, r: DLEQ_R },
  }),
]

/** A kind 9321 event by the sender carrying `tags`. */
export const nutzapEvent = (tags: ReadonlyArray<Tag>): NostrEvent =>
  buildEventFixture({ kind: KIND_NUTZAP, pubkey: SENDER, tags, content: "" })

/** The nutzap `tags` make, failing the test when they make none. */
export const nutzapOf = (tags: ReadonlyArray<Tag>): Nutzap => {
  const nutzap = parseNutzap(nutzapEvent(tags))
  if (nutzap === null) throw new Error("invalid fixture nutzap")
  return nutzap
}

/** A nutzap to the recipient at the mint its info lists, with one proof locked to its key, and `extraTags` after. */
export const payingNutzap = (extraTags: ReadonlyArray<Tag> = []): Nutzap =>
  nutzapOf([["p", RECIPIENT], ["u", MINT], proofTag(21), ...extraTags])

/** A kind 10019 event by `author`, the recipient by default, carrying `tags`. */
export const infoEvent = (tags: ReadonlyArray<Tag>, author = RECIPIENT): NostrEvent =>
  buildEventFixture({ kind: KIND_NUTZAP_MINT_RECOMMENDATION, pubkey: author, tags, content: "" })

/** Nutzap info by `author`, the recipient by default, naming the recipient's P2PK key, the mint and one relay. */
export const recipientsInfo = (author = RECIPIENT): NutzapInfo => {
  const info = parseNutzapInfo(
    infoEvent([["pubkey", P2PK_KEY], ["mint", MINT, "sat"], ["relay", "wss://relay.example"]], author),
  )
  if (info === null) throw new Error("invalid fixture nutzap info")
  return info
}
