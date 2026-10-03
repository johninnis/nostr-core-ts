import { assertEquals } from "@std/assert"
import { encodeEventIdToNote, encodeNaddr, encodeNevent } from "../../src/domain/service/bech32.ts"
import { buildTextNote } from "../../src/domain/service/builder.ts"
import { eventIdFixture, publicKeyFixture, relayUrlFixture } from "../../testing.ts"

const AUTHOR = publicKeyFixture("4".repeat(64))
const EVENT_ID = eventIdFixture("3".repeat(64))
const FIRST_RELAY = relayUrlFixture("wss://first.example")
const LATER_RELAY = relayUrlFixture("wss://later.example")
const ADDRESS = { kind: 30023, pubkey: AUTHOR, dTag: "post" }
const COORDINATE = `30023:${AUTHOR}:post`

const NOTE = encodeEventIdToNote(EVENT_ID)
const neventVia = (relay: typeof FIRST_RELAY): string =>
  encodeNevent(EVENT_ID, { relayUrls: [relay], authorPubkey: AUTHOR, kind: 1 }) ?? ""
const naddrVia = (relays: ReadonlyArray<typeof FIRST_RELAY>): string => encodeNaddr(ADDRESS, relays) ?? ""

const quoteTagsOf = (content: string) => buildTextNote(content).tags.filter((tag) => tag[0] === "q")

Deno.test("buildTextNote - a bare note after an nevent keeps the nevent's relay and author (shared ADR-0076)", () => {
  assertEquals(quoteTagsOf(`nostr:${neventVia(FIRST_RELAY)} then nostr:${NOTE}`), [
    ["q", EVENT_ID, "wss://first.example", AUTHOR],
  ])
})

Deno.test("buildTextNote - an nevent after a bare note gives the one quote its relay and author", () => {
  assertEquals(quoteTagsOf(`nostr:${NOTE} then nostr:${neventVia(FIRST_RELAY)}`), [
    ["q", EVENT_ID, "wss://first.example", AUTHOR],
  ])
})

Deno.test("buildTextNote - of two nevents naming different relays, the first relay is kept", () => {
  assertEquals(quoteTagsOf(`nostr:${neventVia(FIRST_RELAY)} then nostr:${neventVia(LATER_RELAY)}`), [
    ["q", EVENT_ID, "wss://first.example", AUTHOR],
  ])
})

Deno.test("buildTextNote - an naddr with a relay before one without keeps the relay", () => {
  assertEquals(quoteTagsOf(`nostr:${naddrVia([FIRST_RELAY])} then nostr:${naddrVia([])}`), [
    ["q", COORDINATE, "wss://first.example"],
  ])
})

Deno.test("buildTextNote - an naddr without a relay before one with it gains the relay", () => {
  assertEquals(quoteTagsOf(`nostr:${naddrVia([])} then nostr:${naddrVia([FIRST_RELAY])}`), [
    ["q", COORDINATE, "wss://first.example"],
  ])
})

Deno.test("buildTextNote - the merged quote is written where its target is last named", () => {
  const other = encodeEventIdToNote(eventIdFixture("5".repeat(64)))
  assertEquals(buildTextNote(`nostr:${neventVia(FIRST_RELAY)} nostr:${other} nostr:${NOTE}`).tags, [
    ["p", AUTHOR],
    ["q", "5".repeat(64)],
    ["q", EVENT_ID, "wss://first.example", AUTHOR],
  ])
})
