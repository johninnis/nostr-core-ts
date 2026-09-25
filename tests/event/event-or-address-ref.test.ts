import { assertEquals } from "@std/assert"
import { encodeEventIdToNote, encodeNaddr, encodeNevent } from "../../src/domain/service/bech32.ts"
import { eventOrAddressRefFromTag, parseEventOrAddressRef } from "../../src/domain/service/event-or-address-ref.ts"
import type { EventOrAddressRef } from "../../src/domain/value-object/event-or-address-ref.ts"
import { formatEventOrAddressRef } from "../../src/domain/value-object/event-or-address-ref.ts"
import { parseEventId } from "../../src/domain/value-object/event-id.ts"
import { KIND_LONGFORM } from "../../src/domain/value-object/kinds.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"

const PUBKEY = parsePublicKey("a".repeat(64))
const EVENT_ID = parseEventId("c".repeat(64))
const ADDRESS = { kind: KIND_LONGFORM, pubkey: PUBKEY, dTag: "my-article" }
const COORD = `${KIND_LONGFORM}:${PUBKEY}:my-article`
const EVENT_REF: EventOrAddressRef = { type: "event", id: EVENT_ID }
const ADDRESS_REF: EventOrAddressRef = { type: "address", address: ADDRESS }

Deno.test("formatEventOrAddressRef - formats an event ref as its hex id", () => {
  assertEquals(formatEventOrAddressRef(EVENT_REF), EVENT_ID)
})

Deno.test("formatEventOrAddressRef - formats an address ref as its kind:pubkey:d coordinate", () => {
  assertEquals(formatEventOrAddressRef(ADDRESS_REF), COORD)
})

Deno.test("formatEventOrAddressRef - round-trips through parseEventOrAddressRef", () => {
  for (const ref of [EVENT_REF, ADDRESS_REF]) {
    assertEquals(parseEventOrAddressRef(formatEventOrAddressRef(ref)), ref)
  }
})

Deno.test("parseEventOrAddressRef - accepts a hex event id", () => {
  assertEquals(parseEventOrAddressRef(EVENT_ID), EVENT_REF)
})

Deno.test("parseEventOrAddressRef - accepts a kind:pubkey:d coordinate", () => {
  assertEquals(parseEventOrAddressRef(COORD), ADDRESS_REF)
})

Deno.test("parseEventOrAddressRef - accepts a note1 entity", () => {
  assertEquals(parseEventOrAddressRef(encodeEventIdToNote(EVENT_ID)), EVENT_REF)
})

Deno.test("parseEventOrAddressRef - accepts an nevent1 entity", () => {
  assertEquals(parseEventOrAddressRef(encodeNevent(EVENT_ID, { authorPubkey: PUBKEY })), EVENT_REF)
})

Deno.test("parseEventOrAddressRef - accepts an naddr1 entity", () => {
  assertEquals(parseEventOrAddressRef(encodeNaddr(ADDRESS)), ADDRESS_REF)
})

Deno.test("parseEventOrAddressRef - rejects an address with an empty d tag", () => {
  assertEquals(parseEventOrAddressRef(`${KIND_LONGFORM}:${PUBKEY}:`), null)
  assertEquals(parseEventOrAddressRef(encodeNaddr({ ...ADDRESS, dTag: "" })), null)
})

Deno.test("parseEventOrAddressRef - rejects values that are neither an event nor an address", () => {
  for (const value of ["", "not-a-ref", "C".repeat(64), "c".repeat(63), `x:${PUBKEY}:d`]) {
    assertEquals(parseEventOrAddressRef(value), null)
  }
})

Deno.test("parseEventOrAddressRef - rejects an npub", () => {
  assertEquals(parseEventOrAddressRef("npub1" + "q".repeat(58)), null)
})

Deno.test("eventOrAddressRefFromTag - reads an event ref from e and E tags", () => {
  assertEquals(eventOrAddressRefFromTag(["e", EVENT_ID, "", "root"]), EVENT_REF)
  assertEquals(eventOrAddressRefFromTag(["E", EVENT_ID]), EVENT_REF)
})

Deno.test("eventOrAddressRefFromTag - reads an address ref from a and A tags", () => {
  assertEquals(eventOrAddressRefFromTag(["a", COORD, "", "reply"]), ADDRESS_REF)
  assertEquals(eventOrAddressRefFromTag(["A", COORD]), ADDRESS_REF)
})

Deno.test("eventOrAddressRefFromTag - rejects malformed values, the wrong form for the tag, and other tags", () => {
  assertEquals(eventOrAddressRefFromTag(["e", "not-an-id"]), null)
  assertEquals(eventOrAddressRefFromTag(["e", COORD]), null)
  assertEquals(eventOrAddressRefFromTag(["a", EVENT_ID]), null)
  assertEquals(eventOrAddressRefFromTag(["a", `${KIND_LONGFORM}:${PUBKEY}:`]), null)
  assertEquals(eventOrAddressRefFromTag(["p", PUBKEY]), null)
  assertEquals(eventOrAddressRefFromTag(["e"]), null)
})
