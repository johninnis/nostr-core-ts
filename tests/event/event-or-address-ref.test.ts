import { assertEquals } from "@std/assert"
import { encodeEventIdToNote, encodeNaddr, encodeNevent } from "../../src/domain/service/bech32.ts"
import { eventOrAddressRefFromTag, parseEventOrAddressRef } from "../../src/domain/service/event-or-address-ref.ts"
import type { EventOrAddressRef } from "../../src/domain/value-object/event-or-address-ref.ts"
import { formatEventOrAddressRef } from "../../src/domain/value-object/event-or-address-ref.ts"
import { KIND_LONGFORM_CONTENT } from "../../src/domain/value-object/kinds.ts"
import { eventIdFixture, publicKeyFixture } from "../../testing.ts"

const PUBKEY = publicKeyFixture("a".repeat(64))
const EVENT_ID = eventIdFixture("c".repeat(64))
const ADDRESS = { kind: KIND_LONGFORM_CONTENT, pubkey: PUBKEY, dTag: "my-article" }
const COORD = `${KIND_LONGFORM_CONTENT}:${PUBKEY}:my-article`
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

Deno.test("parseEventOrAddressRef - refuses a hex event id with anything around it", () => {
  for (const value of [`\0${EVENT_ID}\t`, ` ${EVENT_ID} `, `\ufeff${EVENT_ID}`]) {
    assertEquals(parseEventOrAddressRef(value), null)
  }
})

Deno.test("parseEventOrAddressRef - accepts a kind:pubkey:d coordinate", () => {
  assertEquals(parseEventOrAddressRef(COORD), ADDRESS_REF)
})

Deno.test("parseEventOrAddressRef - accepts a note1 entity", () => {
  assertEquals(parseEventOrAddressRef(encodeEventIdToNote(EVENT_ID)), EVENT_REF)
})

Deno.test("parseEventOrAddressRef - accepts an nevent1 entity", () => {
  assertEquals(parseEventOrAddressRef(encodeNevent(EVENT_ID, { authorPubkey: PUBKEY }) ?? ""), EVENT_REF)
})

Deno.test("parseEventOrAddressRef - accepts an naddr1 entity", () => {
  assertEquals(parseEventOrAddressRef(encodeNaddr(ADDRESS) ?? ""), ADDRESS_REF)
})

Deno.test("parseEventOrAddressRef - accepts an address with an empty d tag, as a coordinate or an naddr", () => {
  const empty: EventOrAddressRef = { type: "address", address: { ...ADDRESS, dTag: "" } }
  assertEquals(parseEventOrAddressRef(`${KIND_LONGFORM_CONTENT}:${PUBKEY}:`), empty)
  assertEquals(parseEventOrAddressRef(encodeNaddr({ ...ADDRESS, dTag: "" }) ?? ""), empty)
})

Deno.test("parseEventOrAddressRef - rejects an upper-case hex event id", () => {
  assertEquals(parseEventOrAddressRef("C".repeat(64)), null)
})

Deno.test("parseEventOrAddressRef - refuses an entity with a nostr: prefix or space around it", () => {
  const note = encodeEventIdToNote(EVENT_ID)
  for (const value of [`nostr:${note}`, `NOSTR:${note}`, ` ${note} `]) {
    assertEquals(parseEventOrAddressRef(value), null)
  }
})

Deno.test("parseEventOrAddressRef - reads a coordinate exactly as written, space included", () => {
  assertEquals(parseEventOrAddressRef(` ${COORD}`), null)
})

Deno.test("parseEventOrAddressRef - rejects values that are neither an event nor an address", () => {
  for (const value of ["", "not-a-ref", "c".repeat(63), `x:${PUBKEY}:d`]) {
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

Deno.test("eventOrAddressRefFromTag - reads an address with an empty d tag", () => {
  assertEquals(eventOrAddressRefFromTag(["a", `${KIND_LONGFORM_CONTENT}:${PUBKEY}:`]), {
    type: "address",
    address: { ...ADDRESS, dTag: "" },
  })
})

Deno.test("eventOrAddressRefFromTag - rejects malformed values, the wrong form for the tag, and other tags", () => {
  assertEquals(eventOrAddressRefFromTag(["e", "not-an-id"]), null)
  assertEquals(eventOrAddressRefFromTag(["e", COORD]), null)
  assertEquals(eventOrAddressRefFromTag(["a", EVENT_ID]), null)
  assertEquals(eventOrAddressRefFromTag(["p", PUBKEY]), null)
  assertEquals(eventOrAddressRefFromTag(["e"]), null)
})
