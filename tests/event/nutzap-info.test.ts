import { assertEquals } from "@std/assert"
import { parseNutzapInfo } from "../../src/domain/service/nutzap-info.ts"
import type { NutzapInfo } from "../../src/domain/service/nutzap-info.ts"
import { KIND_NUTZAP } from "../../src/domain/value-object/kinds.ts"
import type { Tag } from "../../src/domain/value-object/nostr-event.ts"
import { buildEventFixture, relayUrlFixture, webUrlFixture } from "../../testing.ts"
import { infoEvent, OTHER_P2PK_KEY, P2PK_KEY, RECIPIENT, recipientsInfo } from "../support/nutzap.ts"

const infoOf = (tags: ReadonlyArray<Tag>): NutzapInfo | null => parseNutzapInfo(infoEvent(tags))

Deno.test("parseNutzapInfo - its pubkey is its author", () => {
  assertEquals(recipientsInfo().pubkey, RECIPIENT)
})

for (
  const [what, tags] of [
    ["a bare x-coordinate, as Nostr writes a key", [["pubkey", P2PK_KEY]]],
    ["a 02 prefix, as NIP-61 locks with it", [["pubkey", `02${P2PK_KEY}`]]],
    ["a 03 prefix, the same key to NUT-11", [["pubkey", `03${P2PK_KEY}`]]],
    ["upper-case hex", [["pubkey", P2PK_KEY.toUpperCase()]]],
    ["one key written in two forms, one claim", [["pubkey", P2PK_KEY], ["pubkey", `02${P2PK_KEY}`]]],
    ["a value that is no key beside one that is", [["pubkey", "not a key"], ["pubkey", P2PK_KEY]]],
  ] as const
) {
  Deno.test(`parseNutzapInfo - reads its P2PK key from ${what} (shared ADR-0121)`, () => {
    assertEquals(infoOf(tags)?.p2pkPubkey, P2PK_KEY)
  })
}

for (
  const [what, tags] of [
    ["no pubkey tag, never falling back to the author", []],
    ["pubkey tags that disagree", [["pubkey", P2PK_KEY], ["pubkey", OTHER_P2PK_KEY]]],
    ["a pubkey that is no key", [["pubkey", "not a key"]]],
    ["a 04-prefixed key", [["pubkey", `04${P2PK_KEY}`]]],
  ] as const
) {
  Deno.test(`parseNutzapInfo - an event with ${what} is no nutzap info (shared ADR-0121)`, () => {
    assertEquals(infoOf(tags), null)
  })
}

Deno.test("parseNutzapInfo - a P2PK key that is the author's own key is no nutzap info (NIP-61: MUST NOT)", () => {
  assertEquals(infoOf([["pubkey", RECIPIENT]]), null)
})

Deno.test("parseNutzapInfo - another kind is no nutzap info", () => {
  assertEquals(
    parseNutzapInfo(buildEventFixture({ kind: KIND_NUTZAP, pubkey: RECIPIENT, tags: [["pubkey", P2PK_KEY]] })),
    null,
  )
})

Deno.test("parseNutzapInfo - lists each mint once as written and drops what is no web URL (shared ADR-0121)", () => {
  const info = infoOf([
    ["pubkey", P2PK_KEY],
    ["mint", "https://mint.example", "usd", "sat"],
    ["mint", "HTTPS://Mint.example"],
    ["mint", "not a url"],
    ["mint", "https://mint.example"],
  ])
  assertEquals(info?.mints, [webUrlFixture("https://mint.example"), webUrlFixture("HTTPS://Mint.example")])
})

Deno.test("parseNutzapInfo - an event listing no mint is nutzap info with no mints", () => {
  assertEquals(infoOf([["pubkey", P2PK_KEY]])?.mints, [])
})

Deno.test("parseNutzapInfo - lists each relay once in canonical form and drops what is no relay", () => {
  const info = infoOf([
    ["pubkey", P2PK_KEY],
    ["relay", "wss://Relay.example/"],
    ["relay", "not a relay"],
    ["relay", "wss://relay.example"],
  ])
  assertEquals(info?.relays, [relayUrlFixture("wss://relay.example")])
})
