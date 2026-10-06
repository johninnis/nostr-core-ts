import { assertEquals } from "@std/assert"
import {
  buildAddressableEventFilter,
  buildEventFilter,
  parseNostrEvent,
  parseNostrInput,
  parseUnsignedEvent,
} from "../../src/domain/service/event-utils.ts"
import {
  encodeEventIdToNote,
  encodeNaddr,
  encodeNevent,
  encodeNprofile,
  encodePubkeyToNpub,
} from "../../src/domain/service/bech32.ts"
import { eventIdFixture, publicKeyFixture, relayUrlFixture } from "../../testing.ts"

const HEX_64 = "a".repeat(64)
const HEX_PUBKEY = "b".repeat(64)
const EVENT_ID = eventIdFixture(HEX_64)
const PUBKEY = publicKeyFixture(HEX_PUBKEY)
const RELAY = relayUrlFixture("wss://relay.example.com")

Deno.test("parseNostrInput - does not guess what a bare 64-hex string names", () => {
  assertEquals(parseNostrInput(HEX_64), null)
})

Deno.test("parseNostrInput - trims surrounding whitespace", () => {
  assertEquals(parseNostrInput(`  ${encodeEventIdToNote(EVENT_ID)}  `), { type: "event", id: EVENT_ID, relayHints: [] })
})

Deno.test("parseNostrInput - decodes an npub into a pubkey", () => {
  assertEquals(parseNostrInput(encodePubkeyToNpub(PUBKEY)), { type: "profile", pubkey: PUBKEY, relayHints: [] })
})

Deno.test("parseNostrInput - decodes a note entity into an event id", () => {
  assertEquals(parseNostrInput(encodeEventIdToNote(EVENT_ID)), { type: "event", id: EVENT_ID, relayHints: [] })
})

Deno.test("parseNostrInput - strips a nostr: URI prefix in any case, with space around it", () => {
  assertEquals(parseNostrInput(`  NOSTR:${encodePubkeyToNpub(PUBKEY)}  `), {
    type: "profile",
    pubkey: PUBKEY,
    relayHints: [],
  })
})

Deno.test("parseNostrInput - strips nostr: URI prefix before decoding", () => {
  const npub = encodePubkeyToNpub(PUBKEY)
  assertEquals(parseNostrInput(`nostr:${npub}`), { type: "profile", pubkey: PUBKEY, relayHints: [] })
})

Deno.test("parseNostrInput - carries an nprofile's relay hints", () => {
  assertEquals(parseNostrInput(encodeNprofile(PUBKEY, [RELAY]) ?? ""), {
    type: "profile",
    pubkey: PUBKEY,
    relayHints: [RELAY],
  })
})

Deno.test("parseNostrInput - carries an nevent's relay hints", () => {
  assertEquals(parseNostrInput(encodeNevent(EVENT_ID, { relayUrls: [RELAY] }) ?? ""), {
    type: "event",
    id: EVENT_ID,
    relayHints: [RELAY],
  })
})

Deno.test("parseNostrInput - decodes an naddr, including one with an empty d tag", () => {
  const address = { kind: 10002, pubkey: PUBKEY, dTag: "" }
  assertEquals(parseNostrInput(encodeNaddr(address) ?? ""), { type: "address", address, relayHints: [] })
})

Deno.test("parseNostrInput - returns null for an unrecognised string", () => {
  assertEquals(parseNostrInput("not-a-nostr-entity"), null)
})

Deno.test("buildEventFilter - builds an ids filter from an event id", () => {
  const filter = buildEventFilter({ type: "event", id: EVENT_ID, relayHints: [] })
  assertEquals(filter, { ids: [EVENT_ID] })
})

Deno.test("buildEventFilter - builds an addressable filter from an naddr", () => {
  const filter = buildEventFilter({
    type: "address",
    address: { kind: 30023, pubkey: PUBKEY, dTag: "my-article" },
    relayHints: [],
  })
  assertEquals(filter, { kinds: [30023], authors: [PUBKEY], "#d": ["my-article"], limit: 1 })
})

Deno.test("buildEventFilter - leaves the d tag out for an naddr of a replaceable kind", () => {
  const filter = buildEventFilter({
    type: "address",
    address: { kind: 10002, pubkey: PUBKEY, dTag: "" },
    relayHints: [],
  })
  assertEquals(filter, { kinds: [10002], authors: [PUBKEY], limit: 1 })
})

Deno.test("buildAddressableEventFilter - filters an addressable kind by its d tag", () => {
  const filter = buildAddressableEventFilter({ kind: 30078, pubkey: PUBKEY, dTag: "settings" })
  assertEquals(filter, { kinds: [30078], authors: [PUBKEY], "#d": ["settings"] })
})

Deno.test("buildAddressableEventFilter - leaves the d tag out for a replaceable kind", () => {
  const filter = buildAddressableEventFilter({ kind: 0, pubkey: PUBKEY, dTag: "" })
  assertEquals(filter, { kinds: [0], authors: [PUBKEY] })
})

Deno.test("buildAddressableEventFilter - keeps the d tag for a kind that is not replaceable", () => {
  const filter = buildAddressableEventFilter({ kind: 1, pubkey: PUBKEY, dTag: "" })
  assertEquals(filter, { kinds: [1], authors: [PUBKEY], "#d": [""] })
})

Deno.test("buildEventFilter - returns null for a profile", () => {
  assertEquals(buildEventFilter({ type: "profile", pubkey: PUBKEY, relayHints: [] }), null)
})

const validEvent = {
  id: HEX_64,
  pubkey: HEX_PUBKEY,
  kind: 1,
  created_at: 1700000000,
  tags: [["e", HEX_64]],
  content: "hello",
  sig: "c".repeat(128),
}

Deno.test("parseNostrEvent - returns a NostrEvent for a well-formed value", () => {
  const event = parseNostrEvent(validEvent)
  assertEquals(event?.id, HEX_64)
  assertEquals(event?.pubkey, HEX_PUBKEY)
  assertEquals(event?.kind, 1)
})

Deno.test("parseNostrEvent - keeps exactly the seven NIP-01 fields, so re-serialising never re-emits extras", () => {
  const parsed = parseNostrEvent({ ...validEvent, evil: "<script>", seen_on: ["wss://x"] })
  assertEquals(parsed === null ? null : Object.keys(parsed).sort(), [
    "content",
    "created_at",
    "id",
    "kind",
    "pubkey",
    "sig",
    "tags",
  ])
  assertEquals(JSON.stringify(parsed).includes("evil"), false)
})

Deno.test("parseNostrEvent - returns null for a kind outside NIP-01's 0-65535", () => {
  assertEquals(parseNostrEvent({ ...validEvent, kind: 65536 }), null)
  assertEquals(parseNostrEvent({ ...validEvent, kind: 65535 })?.kind, 65535)
})

Deno.test("parseNostrEvent - returns null for input that is not an object", () => {
  assertEquals(parseNostrEvent("nope"), null)
  assertEquals(parseNostrEvent([1, 2, 3]), null)
  assertEquals(parseNostrEvent(null), null)
})

Deno.test("parseNostrEvent - returns null when id is not a valid event id", () => {
  assertEquals(parseNostrEvent({ ...validEvent, id: "tooshort" }), null)
})

Deno.test("parseNostrEvent - returns null when pubkey is not a valid public key", () => {
  assertEquals(parseNostrEvent({ ...validEvent, pubkey: "tooshort" }), null)
})

Deno.test("parseNostrEvent - returns null when kind is not a number", () => {
  assertEquals(parseNostrEvent({ ...validEvent, kind: "1" }), null)
})

Deno.test("parseNostrEvent - returns null when a tag row is empty or non-string", () => {
  assertEquals(parseNostrEvent({ ...validEvent, tags: [[]] }), null)
  assertEquals(parseNostrEvent({ ...validEvent, tags: [[1, 2]] }), null)
})

Deno.test("parseNostrEvent - returns null when sig is missing", () => {
  assertEquals(parseNostrEvent({ ...validEvent, sig: undefined }), null)
})

Deno.test("parseNostrEvent - returns null when sig is the wrong length", () => {
  assertEquals(parseNostrEvent({ ...validEvent, sig: "c".repeat(127) }), null)
  assertEquals(parseNostrEvent({ ...validEvent, sig: "c".repeat(129) }), null)
})

Deno.test("parseNostrEvent - returns null when kind is not an integer", () => {
  assertEquals(parseNostrEvent({ ...validEvent, kind: 1.5 }), null)
})

Deno.test("parseNostrEvent - returns null when created_at is negative", () => {
  assertEquals(parseNostrEvent({ ...validEvent, created_at: -3 }), null)
})

const validTemplate = {
  kind: 30023,
  created_at: 1700000000,
  tags: [["d", "my-slug"]],
  content: "hello",
}

Deno.test("parseUnsignedEvent - returns a template's four fields for a well-formed value", () => {
  const parsed = parseUnsignedEvent(validTemplate)
  assertEquals(parsed, { kind: 30023, created_at: 1700000000, tags: [["d", "my-slug"]], content: "hello" })
})

Deno.test("parseUnsignedEvent - drops extra fields, so re-serialising never re-emits them", () => {
  const parsed = parseUnsignedEvent({ ...validTemplate, pubkey: HEX_PUBKEY, sig: "c".repeat(128) })
  assertEquals(parsed === null ? null : Object.keys(parsed).sort(), ["content", "created_at", "kind", "tags"])
})

Deno.test("parseUnsignedEvent - returns null for input that is not an object", () => {
  assertEquals(parseUnsignedEvent("nope"), null)
  assertEquals(parseUnsignedEvent(null), null)
})

Deno.test("parseUnsignedEvent - returns null when a field fails the same checks a signed event does", () => {
  assertEquals(parseUnsignedEvent({ ...validTemplate, kind: 65536 }), null)
  assertEquals(parseUnsignedEvent({ ...validTemplate, created_at: -3 }), null)
  assertEquals(parseUnsignedEvent({ ...validTemplate, tags: [[]] }), null)
  assertEquals(parseUnsignedEvent({ ...validTemplate, content: undefined }), null)
})
