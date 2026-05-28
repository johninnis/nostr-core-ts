import { assertEquals } from "@std/assert"
import {
  buildEventFilter,
  parseNostrEvent,
  parseNostrInput,
  validateEventStructure,
} from "../../src/domain/service/event-utils.ts"
import { encodeEventIdToNote, encodePubkeyToNpub } from "../../src/domain/service/bech32.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"
import { parseEventId } from "../../src/domain/value-object/event-id.ts"

const HEX_64 = "a".repeat(64)
const HEX_PUBKEY = "b".repeat(64)
const EVENT_ID = parseEventId(HEX_64)
const PUBKEY = parsePublicKey(HEX_PUBKEY)

Deno.test("parseNostrInput - reads a bare 64-hex string as an event id", () => {
  const parsed = parseNostrInput(HEX_64)
  assertEquals(parsed?.eventId, HEX_64)
  assertEquals(parsed?.relayHints, [])
})

Deno.test("parseNostrInput - lowercases an upper-case hex event id", () => {
  const parsed = parseNostrInput("A".repeat(64))
  assertEquals(parsed?.eventId, HEX_64)
})

Deno.test("parseNostrInput - trims surrounding whitespace", () => {
  const parsed = parseNostrInput(`  ${HEX_64}  `)
  assertEquals(parsed?.eventId, HEX_64)
})

Deno.test("parseNostrInput - decodes an npub into a pubkey", () => {
  const parsed = parseNostrInput(encodePubkeyToNpub(PUBKEY))
  assertEquals(parsed?.pubkey, HEX_PUBKEY)
})

Deno.test("parseNostrInput - decodes a note entity into an event id", () => {
  const parsed = parseNostrInput(encodeEventIdToNote(EVENT_ID))
  assertEquals(parsed?.eventId, HEX_64)
})

Deno.test("parseNostrInput - strips nostr: URI prefix before decoding", () => {
  const npub = encodePubkeyToNpub(PUBKEY)
  const parsed = parseNostrInput(`nostr:${npub}`)
  assertEquals(parsed?.pubkey, HEX_PUBKEY)
})

Deno.test("parseNostrInput - returns null for an unrecognised string", () => {
  assertEquals(parseNostrInput("not-a-nostr-entity"), null)
})

Deno.test("buildEventFilter - builds an ids filter from an event id", () => {
  const filter = buildEventFilter({ eventId: EVENT_ID, relayHints: [] })
  assertEquals(filter, { ids: [EVENT_ID] })
})

Deno.test("buildEventFilter - builds an addressable filter from an naddr", () => {
  const filter = buildEventFilter({
    naddr: { kind: 30023, pubkey: PUBKEY, dTag: "my-article" },
    relayHints: [],
  })
  assertEquals(filter, { kinds: [30023], authors: [PUBKEY], "#d": ["my-article"], limit: 1 })
})

Deno.test("buildEventFilter - returns null when neither an event id nor an naddr is present", () => {
  assertEquals(buildEventFilter({ relayHints: [] }), null)
})

Deno.test("validateEventStructure - marks every field as passed for a well-formed event", () => {
  const checks = validateEventStructure({
    id: HEX_64,
    pubkey: HEX_PUBKEY,
    kind: 1,
    created_at: 1700000000,
    tags: [],
    content: "hello",
    sig: "c".repeat(128),
  })
  assertEquals(checks.every((c) => c.passed), true)
})

Deno.test("validateEventStructure - flags a malformed id and signature", () => {
  const checks = validateEventStructure({
    id: "short",
    pubkey: HEX_PUBKEY,
    kind: 1,
    created_at: 1700000000,
    tags: [],
    content: "hello",
    sig: "tooshort",
  })
  const failed = checks.filter((c) => !c.passed).map((c) => c.field)
  assertEquals(failed, ["id", "sig"])
})

Deno.test("validateEventStructure - flags a non-array tags field", () => {
  const checks = validateEventStructure({
    id: HEX_64,
    pubkey: HEX_PUBKEY,
    kind: 1,
    created_at: 1700000000,
    tags: "not-an-array",
    content: "hello",
    sig: "c".repeat(128),
  })
  assertEquals(checks.find((c) => c.field === "tags")?.passed, false)
})

Deno.test("validateEventStructure - flags a 64-char id that is not valid hex", () => {
  const checks = validateEventStructure({
    id: "z".repeat(64),
    pubkey: HEX_PUBKEY,
    kind: 1,
    created_at: 1700000000,
    tags: [],
    content: "hello",
    sig: "c".repeat(128),
  })
  assertEquals(checks.find((c) => c.field === "id")?.passed, false)
})

Deno.test("validateEventStructure - flags a tags array containing invalid rows", () => {
  const checks = validateEventStructure({
    id: HEX_64,
    pubkey: HEX_PUBKEY,
    kind: 1,
    created_at: 1700000000,
    tags: [[1, 2]],
    content: "hello",
    sig: "c".repeat(128),
  })
  assertEquals(checks.find((c) => c.field === "tags")?.passed, false)
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
